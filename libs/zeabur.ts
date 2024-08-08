import { createClient } from "@zeabur/zeabur-js";

const API_KEY = process.env.ZEABUR_API_KEY || "";

const zeabur = createClient(API_KEY);

export default zeabur;
