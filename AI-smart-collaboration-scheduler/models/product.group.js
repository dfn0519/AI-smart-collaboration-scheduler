const mongoose = require("mongoose");

const groupSchema = mongoose.Schema(
    {
        name : { type: String, required: true },
        /*
        owner : {
            type : mongoose.Schema.Types.ObjectId,
            ref : "Account",
            required : [true, "Please enter owner ID"]
        },
        */
        members: { type: [String], default: [] }, 
        image: { type: String, default: "" },
        chatHistory: [
            {
                role: { type: String, enum: ["system", "assistant", "user"], required: true },
                content: { type: String, required: true },
                speaker: { type: String, required: false },
                haveTasked: { type: Boolean, default: false } // "user" 或 "AI"
            }
        ]
    },
    {
        timestamps: true
    }
);

const Group = mongoose.model("Group", groupSchema);
module.exports = Group;