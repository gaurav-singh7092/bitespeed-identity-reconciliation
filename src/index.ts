import express, { Request, Response } from "express";
import { identify } from "./service";
import { IdentifyRequest } from "./types";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 8000;

// Health check
app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// POST /identify
app.post("/identify", async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body as IdentifyRequest;

    // Validate: at least one field must be provided
    if (email == null && phoneNumber == null) {
      res
        .status(400)
        .json({ error: "At least one of email or phoneNumber must be provided" });
      return;
    }

    const result = await identify(email, phoneNumber);
    res.json(result);
  } catch (err) {
    console.error("Error in /identify:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
