// controllers/publicKeyController.js
import PublicKey from "../models/PublicKey.js";

// Upload user public key
export const uploadPublicKey = async (req, res) => {
  try {
    const { userId, publicKey } = req.body;
    console.log(publicKey);
    console.log("UserId:" , userId);

    if (!userId || !publicKey) {
      return res.status(400).json({ message: "userId and publicKey are required" });
    }

    await PublicKey.findOneAndUpdate(
      { userId },
      { publicKey },
      { upsert: true, new: true }
    );

    res.sendStatus(204);
  } catch (error) {
    console.error("Upload public key error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get recipient public key
export const getPublicKey = async (req, res) => {
  try {
    const { userId } = req.params;

    const keyRecord = await PublicKey.findOne({ userId });
    if (!keyRecord) return res.status(404).json({ message: "Public key not found" });

    res.json({ publicKey: keyRecord.publicKey });
  } catch (error) {
    console.error("Get public key error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
