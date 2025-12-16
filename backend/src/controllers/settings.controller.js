import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";


export const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { fullName, username, bio, location } = req.body;

    // Update fields if provided
    if (fullName) user.fullName = fullName;
    if (bio) user.bio = bio;
    if (location) user.location = location;

    // Username uniqueness check
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({ message: "Username already in use" });
      }
      user.username = username;
    }

    // Profile picture upload (overwrite existing)
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "reon/profile_pics",
            public_id: user.profilePicId || undefined, // reuse same ID
            overwrite: true,
            invalidate: true
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(req.file.buffer);
      });

      user.profilePic = uploadResult.secure_url;
      user.profilePicId = uploadResult.public_id;
    }

    // Save user (handle duplicate username)
    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.username) {
        return res.status(400).json({ message: "Username already in use" });
      }
      throw err;
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      user
    });

  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Server error while updating profile" });
  }
};




import sendEmail from "../utils/sendEmail.js";

export const changePassword = async (req, res) => {
  try {
    const userOld = req.user; // your authenticated user
    // Fetch user from DB including the password
    const user = await User.findById(userOld._id).select("+password");
    console.log("Password from DB:", user.password);

    if (!user) return res.status(404).json({ message: "User not found" });

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    console.log(isMatch);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // // Send notification email
    // await sendEmail({
    //   to: user.email,
    //   subject: "Your Password Has Been Changed",
    //   title: "Password Update Successful",
    //   body: `<p>Hi ${user.fullName}, your password was successfully changed. If you did not perform this action, please reset your password immediately.</p>`,
    //   buttonText: "Reset Password",
    //   buttonLink: "http://localhost:5173/forgot-password",
    // });

    return res.status(200).json({ message: "Password updated successfully" });

  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Server error while changing password" });
  }
};
