import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing env: MONGODB_URI");
}

interface GlobalMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = global as unknown as { mongoose?: GlobalMongoose };

const cached = globalForMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

globalForMongoose.mongoose = cached;

export default async function dbConnect() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI!, {
        dbName: "astra",
        bufferCommands: false,
        // serverSelectionTimeoutMS: 5000, // optional safety
        // maxPoolSize: 5,                // optional: keep small in serverless
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
