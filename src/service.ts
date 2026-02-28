import { PrismaClient } from "@prisma/client";
import { IdentifyResponse } from "./types";

const prisma = new PrismaClient();

type Contact = Awaited<ReturnType<typeof prisma.contact.findFirst>> & {};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Find all non-deleted contacts matching the given email OR phoneNumber. */
async function findMatchingContacts(
  email?: string | null,
  phoneNumber?: string | null
): Promise<Contact[]> {
  const conditions: object[] = [];
  if (email) conditions.push({ email });
  if (phoneNumber) conditions.push({ phoneNumber });
  if (conditions.length === 0) return [];

  return prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: conditions,
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Resolve a contact to its primary. */
async function getPrimary(contact: Contact): Promise<Contact> {
  if (contact.linkPrecedence === "primary") return contact;
  if (contact.linkedId == null) return contact;

  const primary = await prisma.contact.findFirst({
    where: { id: contact.linkedId, deletedAt: null },
  });
  return primary ?? contact;
}

/** Get all contacts in a cluster (primary + all its secondaries). */
async function getFullCluster(primaryId: number): Promise<Contact[]> {
  return prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: primaryId }, { linkedId: primaryId }],
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Build the consolidated response from a cluster. */
function buildResponse(
  primary: Contact,
  cluster: Contact[]
): IdentifyResponse {
  const emails: string[] = [];
  const phones: string[] = [];
  const secondaryIds: number[] = [];

  // Primary's info first
  if (primary.email && !emails.includes(primary.email)) {
    emails.push(primary.email);
  }
  if (primary.phoneNumber && !phones.includes(primary.phoneNumber)) {
    phones.push(primary.phoneNumber);
  }

  for (const c of cluster) {
    if (c.id === primary.id) continue;
    if (c.email && !emails.includes(c.email)) emails.push(c.email);
    if (c.phoneNumber && !phones.includes(c.phoneNumber))
      phones.push(c.phoneNumber);
    secondaryIds.push(c.id);
  }

  return {
    contact: {
      primaryContactId: primary.id,
      emails,
      phoneNumbers: phones,
      secondaryContactIds: secondaryIds,
    },
  };
}

// ──────────────────────────────────────────────
// Main identify logic
// ──────────────────────────────────────────────

export async function identify(
  email?: string | null,
  phoneNumber?: string | null
): Promise<IdentifyResponse> {
  // 1. Cluster Discovery
  const matches = await findMatchingContacts(email, phoneNumber);

  // 2. New Customer — no matches → create primary
  if (matches.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkPrecedence: "primary",
      },
    });
    return buildResponse(newContact, [newContact]);
  }

  // 3. Resolve every match to its primary
  const primariesMap = new Map<number, Contact>();
  for (const m of matches) {
    const p = await getPrimary(m);
    primariesMap.set(p.id, p);
  }

  // Sort by createdAt — oldest wins
  const sortedPrimaries = [...primariesMap.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const oldestPrimary = sortedPrimaries[0];

  // 4. Primary Merging — if request links two+ different clusters
  if (sortedPrimaries.length > 1) {
    for (let i = 1; i < sortedPrimaries.length; i++) {
      const newerPrimary = sortedPrimaries[i];

      // Demote the newer primary to secondary
      await prisma.contact.update({
        where: { id: newerPrimary.id },
        data: {
          linkPrecedence: "secondary",
          linkedId: oldestPrimary.id,
        },
      });

      // Re-parent all descendants of the newer primary
      await prisma.contact.updateMany({
        where: {
          linkedId: newerPrimary.id,
          deletedAt: null,
          NOT: { id: newerPrimary.id },
        },
        data: {
          linkedId: oldestPrimary.id,
        },
      });
    }
  }

  // 5. Expansion — check if the request brings new information
  let cluster = await getFullCluster(oldestPrimary.id);

  const existingEmails = new Set(
    cluster.filter((c) => c.email).map((c) => c.email!)
  );
  const existingPhones = new Set(
    cluster.filter((c) => c.phoneNumber).map((c) => c.phoneNumber!)
  );

  const newEmail = email != null && !existingEmails.has(email);
  const newPhone = phoneNumber != null && !existingPhones.has(phoneNumber);

  if (newEmail || newPhone) {
    await prisma.contact.create({
      data: {
        email: email ?? null,
        phoneNumber: phoneNumber ?? null,
        linkedId: oldestPrimary.id,
        linkPrecedence: "secondary",
      },
    });
    // Re-fetch cluster to include the new secondary
    cluster = await getFullCluster(oldestPrimary.id);
  }

  // 6. Build & return response
  return buildResponse(oldestPrimary, cluster);
}
