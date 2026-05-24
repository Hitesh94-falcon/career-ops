#!/usr/bin/env node

/**
 * AI-powered job ranker for career-ops
 * Uses GitHub Models API to score jobs from pipeline.md
 */

import fs from 'fs';
import { config } from 'dotenv';

config();

// GitHub Models API
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ENDPOINT = "https://models.github.ai/inference";
const MODEL_NAME = "meta/Llama-4-Scout-17B-16E-Instruct";

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN not found in .env');
  console.error('   Get a GitHub token: https://github.com/settings/tokens');
  console.error('   Needs: read:packages scope');
  process.exit(1);
}

const client = ModelClient(
  ENDPOINT,
  new AzureKeyCredential(GITHUB_TOKEN)
);

// Load candidate profile
function loadProfile() {
  const cvContent = fs.readFileSync('./cv.md', 'utf-8');
  const profileContent = fs.readFileSync('./modes/_profile.md', 'utf-8');

  return {
    cv: cvContent,
    profile: profileContent
  };
}

// Load jobs from pipeline
function loadJobs() {
  const pipelineFile = './data/pipeline.md';

  if (!fs.existsSync(pipelineFile)) {
    console.error('❌ pipeline.md not found');
    process.exit(1);
  }

  const content = fs.readFileSync(pipelineFile, 'utf-8');
  const lines = content.split('\n');

  const jobs = [];

  for (const line of lines) {
    // Match:
    // - [ ] URL | Company | Title
    const match = line.match(
      /^\s*-\s*\[\s*\]\s+(https?[^\s|]+)\s*\|\s*([^|]+)\s*\|\s*(.+)$/
    );

    if (match) {
      const [, url, company, title] = match;

      jobs.push({
        url: url.trim(),
        company: company.trim(),
        title: title.trim(),
        score: null
      });
    }
  }

  return jobs;
}

// Score job using GitHub Models API
async function scoreJobWithAPI(title, company, url) {
  const prompt = `
You are evaluating job relevance for a Master's student in:
- Deep Learning
- Computer Vision
- AI Engineering
- Python/PyTorch
- Germany-based working student roles

Job:
Title: ${title}
Company: ${company}

Rate fit from 0 to 5.

Rules:
- 5 = perfect match
- 3 = moderate match
- 0 = poor fit

Respond ONLY with a single number like:
4.2
`;

  // 30-second timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('API_TIMEOUT'));
    }, 30000);
  });

  try {
    // Race API request against timeout
    const response = await Promise.race([
      client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.4,
          max_tokens: 5,
          model: MODEL_NAME
        }
      }),
      timeoutPromise
    ]);

    if (isUnexpected(response)) {
      const errorMsg =
        response.body?.error?.message ||
        `HTTP ${response.status}`;

      const lowerError = errorMsg.toLowerCase();

      // Detect GitHub API rate limit
      if (
        response.status === 429 ||
        lowerError.includes('rate limit') ||
        lowerError.includes('too many requests') ||
        lowerError.includes('quota')
      ) {
        console.error('\n❌ GitHub Models API rate limited');
        process.exit(1);
      }

      throw new Error(errorMsg);
    }

    const scoreText =
      response.body.choices[0].message.content.trim();

    const score = parseFloat(scoreText);

    if (isNaN(score)) {
      return 3.0;
    }

    return Math.min(5.0, Math.max(0, score));

  } catch (err) {
    // Timeout → trigger fallback chain
    if (err.message === 'API_TIMEOUT') {
      console.error('\n❌ GitHub Models API timeout (30s)');
      process.exit(1);
    }

    const lowerMsg = err.message.toLowerCase();

    // Detect rate limit
    if (
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('too many requests') ||
      lowerMsg.includes('quota')
    ) {
      console.error('\n❌ GitHub Models API rate limited');
      process.exit(1);
    }

    console.log(`  ⚠️ Error: ${err.message}`);

    return 3.0;
  }
}

async function main() {
  console.log('\n📂 Loading candidate profile...');
  loadProfile();

  console.log('\n🔑 Using GitHub Models API');
  console.log(`   Model: ${MODEL_NAME}`);

  const jobs = loadJobs();

  console.log(`\n📊 Jobs loaded: ${jobs.length}`);

  console.log(`\n🤖 Scoring jobs with GitHub Models API...`);
  console.log('(This may take 1-2 minutes)\n');

  const results = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    const display =
      `${job.company} | ${job.title.substring(0, 50)}`;

    process.stdout.write(
      `[${i + 1}/${jobs.length}] ${display}... `
    );

    try {
      const score = await scoreJobWithAPI(
        job.title,
        job.company,
        job.url
      );

      console.log(`✅ ${score.toFixed(1)}/5.0`);

      results.push({
        ...job,
        score,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.log(`❌ ${err.message}`);
    }

    // Small delay to reduce rate-limit risk
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Sort descending
  results.sort((a, b) => b.score - a.score);

  // IMPORTANT:
  // Correct output filename for fallback system
  const rankingsFile =
    './data/job-rankings-github.json';

  fs.writeFileSync(
    rankingsFile,
    JSON.stringify(results, null, 2)
  );

  console.log(`\n✨ Top 5 Jobs`);
  console.log('─'.repeat(80));

  results.slice(0, 5).forEach((job, i) => {
    console.log(
      `${i + 1}. [${job.score.toFixed(1)}/5.0] ` +
      `${job.company} - ${job.title}`
    );

    console.log(`   ${job.url}\n`);
  });

  console.log(`📊 Full results saved to: ${rankingsFile}`);
  console.log(`\n✅ Ranking complete!`);
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err.message);
  process.exit(1);
});