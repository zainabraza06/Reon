import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    trim: true,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
  },
  password: {
    type: String,
    minlength: 8,
  },
  username: {
    type: String,
    unique: true,
    sparse: true, // allows username to be empty initially
  },
  bio: {
    type: String,
    default: "",
  },
  profilePic: {
    type: String,
    default: "",
  },
  nativeLanguage: {
    type: String,
    default: "",
  },
  location : {
    type:String,
    default:"",
  },
  isOnboarded: {
    type: Boolean,
    default: false,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: String,
  verificationTokenExpires: Date,
  googleId: { type: String }, // optional for Google OAuth
  passwordResetToken: String,
  passwordResetExpires: Date,

  profilePicId: {
  type: String,
},

  lastSeen: {
    type: Date,
  },

  privacySettings: {
    showLastSeen:     { type: Boolean, default: true },
    showActiveStatus: { type: Boolean, default: true },
  },

  friends: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

  ],
}, { timestamps: true });

// Hash password before saving (only if password exists and is modified)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false; // Google users have no password
  return await bcrypt.compare(candidatePassword, this.password);
};

// Hide sensitive fields when returning user object
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.hasPassword = Boolean(this.password);
  delete obj.password;
  delete obj.verificationToken;
  delete obj.verificationTokenExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

const User = mongoose.model("User", userSchema);

export default User;
