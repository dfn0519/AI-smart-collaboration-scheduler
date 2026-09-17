const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true
    },

    date: {
      type: String, // "2026-01-09"
      required: true
    },

    title: {
      type: String,
      required: true
    },

    content: {
      type: String,
      required: true
    },

    time: {
      type: String, // "09:00"
      required: true
    },

    duration: {
      type: Number, // ??
      required: true
    },

    finished: {
      type: Boolean,
      default: false
    },

    finishedStartTime: {
      type: String,
      default: ""
    },

    finishedDuration: {
      type: Number,
      default: 0
    },

    finishedEnergyLevel: {
      type: String,
      enum: ["疲勞", "普通", "輕鬆"],
      default: "普通"
    },

    finishedCompletionStatus: {
      type: String,
      enum: ["完成", "非準時完成", "未完成", ""],
      default: ""
    }
  },
  { 
    timestamps: true 
  }
);

const Task = mongoose.model("Task", taskSchema);
module.exports = Task;