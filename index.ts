import { getNewsNoDetails } from "mal-scraper";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "redis";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT;
const REDIS_URI = process.env.REDIS_URI;

async function sendNews() {
    try {
        const redis = createClient({ url: REDIS_URI });
        redis.on("error", (err) => console.error("Redis Error:", err));
        await redis.connect();

        const news = await getNewsNoDetails();
        const latest = news[0];
        const title = latest.title;
        const text = latest.text!;
        const link = latest.link!;

        const lastSentLink = await redis.get("last_sent_news_link");
        if (lastSentLink === link) {
            console.log("No new news to send.");
            await redis.quit();
            return;
        }

        const html = (await axios.get(link)).data;
        const $ = cheerio.load(html);
        const imageUrl = $("img.userimg.img-a-r").attr("src") || null;

        const formattedText = text.replace(/\.\.\.$/, `<a href="${link}">...</a>`);
        const caption =
            `<b>${title}</b>\n\n<i>${formattedText}</i>\n\n<i>Join :</i> <b>${CHAT_ID}</b>`;

        const replyMarkup = {
            inline_keyboard: [[{ text: "Read more", url: link }]],
        };

        const payload = {
            chat_id: CHAT_ID,
            parse_mode: "HTML",
            reply_markup: replyMarkup,
        };

        if (imageUrl) {
            await axios.post(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
                {
                    ...payload,
                    photo: imageUrl,
                    caption,
                }
            );
        } else {
            await axios.post(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    ...payload,
                    text: caption,
                    disable_web_page_preview: true,
                }
            );
        }

        await redis.set("last_sent_news_link", link);
        await redis.quit();

        console.log("✅ News sent:", title);
    } catch (error) {
        if (error instanceof Error) {
            console.error("❌ Error sending news:", error.message || error);
        } else {
            console.log("Error: ", error);
        }
    }
}

cron.schedule("*/2 * * * *", () => {
    console.log("⏰ Checking for new news...");
    sendNews();
});

sendNews();
setInterval(() => { }, 1 << 30);