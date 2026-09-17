require("dotenv").config();

const mongoose = require("mongoose");
const Task = require("./models/product.task.js");
const Account = require("./models/product.account.js");

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_USER_NAME = process.env.SEED_TARGET_USER_NAME;

// 可依照測試需求調整的示範歷史任務。
const sampleTasks = [
  ["2026-09-08", "19:00", 60, "讀書"],
  ["2026-09-10", "20:30", 90, "專題"],
  ["2026-09-12", "14:00", 60, "作業"],
  ["2026-09-14", "18:30", 45, "運動"],
  ["2026-09-16", "21:00", 90, "讀書"],
  ["2026-09-17", "19:30", 120, "專題"]
];

function buildDocuments(owner) {
  return sampleTasks.map(([date, time, duration, title]) => ({
    owner,
    date,
    time,
    duration,
    title,
    content: `示範歷史紀錄：${title}`,
    finished: true,
    finishedStartTime: `${date}T${time}`,
    finishedDuration: duration,
    finishedEnergyLevel: "普通",
    finishedCompletionStatus: "完成"
  }));
}

async function main() {
  if (!MONGODB_URI || !TARGET_USER_NAME) {
    throw new Error("請在 .env 設定 MONGODB_URI 與 SEED_TARGET_USER_NAME");
  }

  await mongoose.connect(MONGODB_URI);
  const account = await Account.findOne({ userName: TARGET_USER_NAME });

  if (!account) {
    throw new Error(`找不到測試帳號：${TARGET_USER_NAME}`);
  }

  for (const document of buildDocuments(account._id)) {
    await Task.updateOne(
      {
        owner: document.owner,
        date: document.date,
        time: document.time,
        title: document.title
      },
      { $setOnInsert: document },
      { upsert: true }
    );
  }

  console.log("示範歷史任務已匯入");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("匯入失敗：", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
