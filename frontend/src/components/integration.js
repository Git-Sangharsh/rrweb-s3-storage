// Import necessary libraries
import { record } from "rrweb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';

// Configure the S3 client with your credentials
const s3 = new S3Client({
  region: "REGION",
  credentials: {
    accessKeyId: "ACCESS_KEY_ID",
    secretAccessKey: "SECRET_ACCESS_KEY",
  },
});

// Generate a unique session ID at the start
const sessionId = `${new Date().toISOString()}-${uuidv4()}`;

// Function to save event to S3
async function saveEventToS3(event) {
  const params = {
    Bucket: "BUCKET_NAME",
    Key: `events/${sessionId}-${Date.now()}.json`,
    Body: JSON.stringify({
      sessionId,
      timeStamp: Date.now(),
      event,
    }),
    ContentType: "application/json",
  };

  try {
    const command = new PutObjectCommand(params);
    await s3.send(command);
    console.log("Event saved to S3:", params.Key);
  } catch (error) {
    console.error("Error saving event to S3:", error);
  }
}

// Start recording with rrweb
record({
  emit(event) {
    saveEventToS3(event);
  }
});
