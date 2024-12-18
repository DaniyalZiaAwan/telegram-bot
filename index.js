// Import necessary libraries
import { Telegraf } from "telegraf";
import mongoose from "mongoose";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const setUser = async () => {
  let setUser = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    mongoUri: process.env.MONGO_URI,
    openAiApiKey: process.env.OPENAI_API_KEY,
    chatId: null,
    conversation: [],
    userInput: null,
    chatGptResponse: null,
    questions: [
      "Are you looking for a health insurance plan?",
      "What is your family size?",
      "What is your household income?",
      "What is your gender?",
    ],
    currentQuestionIndex: 0,
  };
  return setUser;
};

// Mongoose Conversation Schema
const conversationSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  conversation: { type: Array, required: true },
  updatedAt: { type: Date, default: Date.now },
});

const Conversation = mongoose.model("Conversation", conversationSchema);

const connectMongo = async ({ mongoUri }) => {
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("MongoDB connected successfully.");
};

const receiveAnswer = async ({ message }) => {
  return message.text;
};

const interactWithChatGpt = async ({ userInput, openAiApiKey, conversation }) => {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [
        ...conversation,
        { role: "user", content: userInput || "Generate the next relevant question." },
      ],
    },
    {
      headers: { Authorization: `Bearer ${openAiApiKey}` },
    }
  );
  return response.data.choices[0].message.content;
};

const saveConversation = async ({ chatId, conversation }) => {
  await Conversation.findOneAndUpdate(
    { chatId },
    { conversation, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

const sendNextQuestion = async ({ bot, chatId, questions, currentQuestionIndex }) => {
  if (currentQuestionIndex < questions.length) {
    await bot.telegram.sendMessage(chatId, questions[currentQuestionIndex]);
  }
};

const sendGeneratedQuestion = async ({ bot, chatId, chatGptResponse }) => {
  await bot.telegram.sendMessage(chatId, chatGptResponse);
};

const launchBot = async () => {
  try {
    let User = await setUser();

    // Connect MongoDB
    await connectMongo(User);

    // Initialize Telegram bot
    const bot = new Telegraf(User.botToken);

    bot.start((ctx) => {
      User.chatId = ctx.chat.id;
      User.conversation.push({ role: "system", content: "Start health insurance inquiry." });
      bot.telegram.sendMessage(User.chatId, "Hello! Let's begin.");
      sendNextQuestion({ bot, chatId: User.chatId, questions: User.questions, currentQuestionIndex: User.currentQuestionIndex });
    });

    bot.on("text", async (ctx) => {
      User.chatId = ctx.chat.id;
      User.userInput = await receiveAnswer({ message: ctx.message });
      User.conversation.push({ role: "user", content: User.userInput });

      if (User.currentQuestionIndex < User.questions.length - 1) {
        User.currentQuestionIndex++;
        await sendNextQuestion({ bot, chatId: User.chatId, questions: User.questions, currentQuestionIndex: User.currentQuestionIndex });
      } else if (User.currentQuestionIndex === User.questions.length - 1) {
        // If predefined questions are completed, interact with ChatGPT
        User.chatGptResponse = await interactWithChatGpt(User);
        User.conversation.push({ role: "assistant", content: User.chatGptResponse });
        await sendGeneratedQuestion({ bot, chatId: User.chatId, chatGptResponse: User.chatGptResponse });
      }

      // Save to MongoDB
      await saveConversation({ chatId: User.chatId, conversation: User.conversation });
    });

    // Start bot
    bot.launch();
    console.log("Bot is running...");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.error(error);
  }
};

launchBot();

// Step 1: Add .env file with following keys
// TELEGRAM_BOT_TOKEN
// MONGO_URI
// OPENAI_API_KEY

// Step 2: run npm i command
// Step 3: node index.js