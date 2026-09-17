const mongoose = require("mongoose");

const accountSchema = mongoose.Schema(
    {
        userName: {
            type: String,
            required: [true, "Please enter product name"],
            unique: true,
        },

        password: {
            type: String,
            required: [true, "Please enter product password"]
        },

        groups: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Group",
                default: [],
            }
        ],

        tasks: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Task",
                default: [],
            }
        ],

        user_form: {
            available_time: {
                Mon: { type: [String], default: [] },
                Tue: { type: [String], default: [] },
                Wed: { type: [String], default: [] },
                Thu: { type: [String], default: [] },
                Fri: { type: [String], default: [] },
                Sat: { type: [String], default: [] },
                Sun: { type: [String], default: [] }
            },
            best_focus_periods: { type: [String], default: [] },
            ideal_task_duration: { type: String, default: "" },
            task_types: [{
                name: { type: String },
                focus_level: { type: String }
            }],
            time_preferences: {
                morning: { type: String, default: "" },
                afternoon: { type: String, default: "" },
                evening: { type: String, default: "" },
                night: { type: String, default: "" }
            }
        }
    },
    {
        timestamps: true //紀錄creatAt / updatedAt 就是一筆新增時間以及更新時間
    }
);

const Account = mongoose.model("Account", accountSchema);
module.exports = Account;