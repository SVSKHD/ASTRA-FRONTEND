import express, { Request, Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";
dotenv.config({ path: path.resolve(__dirname, envFile) });

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error("Error: MONGO_URI is not defined in environment variables.");
  process.exit(1);
}

mongoose
  .connect(mongoUri, { dbName: "astra" })
  .then(() => console.log("Connected to MongoDB (astra)"))
  .catch((err: unknown) => console.error("MongoDB connection error:", err));

app.get(
  "/api/xagusd/latest",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ status: "Database not initialized" });
      }

      const collection = db.collection("ASTRA-XAGUSD-DB");

      try {
        await collection.createIndex(
          { ts: -1 },
          { background: true, name: "ts_-1" },
        );
      } catch (idxError) {
        console.warn("Index creation warning:", idxError);
      }

      const latestData = await collection.findOne(
        {},
        {
          sort: { ts: -1 },
          projection: { balance_snapshot: 1, ts: 1 },
        },
      );

      if (!latestData) {
        return res.status(404).json({ message: "No data found" });
      }

      return res.status(200).json(latestData);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      return res.status(500).json({ error: error.message || "Unknown error" });
    }
  },
);

app.get(
  "/api/xagusd/history",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ status: "Database not initialized" });
      }

      const collection = db.collection("ASTRA-XAGUSD-DB");

      const historyData = await collection
        .find(
          { balance_snapshot: { $exists: true } },
          {
            sort: { ts: -1 },
            limit: 100,
            projection: { balance_snapshot: 1, ts: 1 },
          },
        )
        .toArray();

      return res.status(200).json(historyData.reverse());
    } catch (error: any) {
      console.error("Error fetching history:", error);
      return res.status(500).json({ error: error.message || "Unknown error" });
    }
  },
);

app.get(
  "/api/xauusd/latest",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ status: "Database not initialized" });
      }

      const collection = db.collection("ASTRA-XAUUSD-DB");

      try {
        await collection.createIndex(
          { ts: -1 },
          { background: true, name: "ts_-1" },
        );
      } catch (idxError) {
        console.warn("Index creation warning:", idxError);
      }

      const latestData = await collection.findOne(
        {},
        {
          sort: { ts: -1 },
          projection: { balance_snapshot: 1, ts: 1 },
        },
      );

      if (!latestData) {
        return res.status(404).json({ message: "No data found for XAUUSD" });
      }

      return res.status(200).json(latestData);
    } catch (error: any) {
      console.error("Error fetching XAUUSD data:", error);
      return res.status(500).json({ error: error.message || "Unknown error" });
    }
  },
);

app.get(
  "/api/xauusd/history",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        return res.status(500).json({ status: "Database not initialized" });
      }

      const collection = db.collection("ASTRA-XAUUSD-DB");

      const historyData = await collection
        .find(
          { balance_snapshot: { $exists: true } },
          {
            sort: { ts: -1 },
            limit: 100,
            projection: { balance_snapshot: 1, ts: 1 },
          },
        )
        .toArray();

      return res.status(200).json(historyData.reverse());
    } catch (error: any) {
      console.error("Error fetching XAUUSD history:", error);
      return res.status(500).json({ error: error.message || "Unknown error" });
    }
  },
);

app.get(
  "/api/external-data",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const url = process.env.EXTERNAL_API_URL || "https://spasta.online/";
      const response = await axios.get(url);
      return res.status(response.status).send(response.data);
    } catch (error: any) {
      console.error("Error fetching external data:", error);
      if (error.response) {
        return res.status(error.response.status).send(error.response.data);
      }
      return res.status(500).json({ error: error.message || "Unknown error" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
