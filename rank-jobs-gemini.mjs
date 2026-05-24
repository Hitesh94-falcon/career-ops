#!/usr/bin/env node

/**
 * AI-powered job ranker using Gemini API (fallback from GitHub Models)
 * Scores top 15 jobs from pipeline.md based on keywords and profile
 */

import fs from 'fs';
import { config } from 'dotenv';
import yaml from 'js-yaml';

config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in .env');
  process.exit(1);
}

// Profile configuration
let profile = {};
try {
  const profileYaml = fs.readFileSync('config/profile.yml', 'utf8');
  profile = yaml.load(profileYaml);
} catch (err) {
  console.error('Failed to load profile:', err.message);
}

console.log('📂 Loading candidate profile...');
console.log(`   Name: ${profile.candidate?.name || 'Unknown'}`);
console.log(`   Location: ${profile.candidate?.location || 'Germany'}`);
console.log('\n🔑 Using Gemini API');
console.log(`   Model: ${GEMINI_MODEL}`);

// Load jobs from pipeline
function loadJobs() {
  const pipelinePath = 'data/pipeline.md';
  if (!fs.existsSync(pipelinePath)) {
    console.error('❌ pipeline.md not found');
    return [];
  }

  const content = fs.readFileSync(pipelinePath, 'utf8');
  const jobs = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match format: - [ ] URL | Company | Title
    const match = line.match(/^\s*-\s*\[\s*\]\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (match) {
      jobs.push({
        url: match[1].trim(),
        company: match[2].trim(),
        title: match[3].trim(),
      });
    }
  }

  return jobs;
}

// Keyword-based pre-filtering
function filterJobsByKeywords(jobs, topN = 15) {
  const PROFILE_KEYWORDS = [
    'deep learning', 'dl', 'machine learning', 'ml', 'neural network',
    'computer vision', 'cv', 'image processing', 'nlp', 'llm',
    'pytorch', 'tensorflow', 'python', 'data science',
    'ai', 'künstliche intelligenz', 'bildverarbeitung', 'maschinelles lernen'
  ];

  const NEGATIVE_KEYWORDS = [
    'frontend', 'ui', 'ux', 'react', 'angular', 'web development',
    'devops', 'infrastructure', 'database admin', 'sysadmin'
  ];

  const scores = jobs.map(job => {
    const text = `${job.title} ${job.company}`.toLowerCase();
    let score = 0;

    for (const keyword of PROFILE_KEYWORDS) {
      if (text.includes(keyword)) score += 10;
    }

    for (const keyword of NEGATIVE_KEYWORDS) {
      if (text.includes(keyword)) score -= 20;
    }

    return { ...job, score };
  });

  return scores
    .filter(j => j.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// Score a single job
async function scoreJobWithGemini(title, company, url) {
  const prompt = `Score this job for a Master's student in Deep Learning/Computer Vision (0-5.0):

Job: ${title}
Company: ${company}

Candidate: Deep Learning specialist, CV expert, Python/PyTorch, production AI systems, Germany-based working student.

Rate 0-5 (5=perfect fit, 3=moderate, 0=poor). ONLY RESPOND WITH A SINGLE NUMBER LIKE 4.2`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 5,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      const errorMsg = error.error?.message || `HTTP ${response.status}`;
      
      // Check for rate limit error
      if (errorMsg.includes('exceeded your current quota') || errorMsg.includes('quota') || response.status === 429) {
        throw new Error('RATE_LIMIT: ' + errorMsg);
      }
      
      throw new Error(errorMsg);
    }

    const data = await response.json();
    const scoreText = data.candidates[0].content.parts[0].text.trim();
    const score = parseFloat(scoreText);

    if (isNaN(score)) {
      return 3.0;
    }

    return Math.min(5.0, Math.max(0, score));
  } catch (err) {
    // Re-throw rate limit errors to signal fallback needed
    if (err.message.startsWith('RATE_LIMIT')) {
      throw err;
    }
    console.log(`  ⚠️ Error: ${err.message}`);
    return 3.0;
  }
}

// Main execution
async function main() {
  const allJobs = loadJobs();
  console.log(`\n🔍 Pre-filtering by keyword relevance...`);
  console.log(`   Total jobs in pipeline: ${allJobs.length}`);

  const topJobs = filterJobsByKeywords(allJobs, 15);
  console.log(`   Top ${topJobs.length} by keyword match selected for AI scoring`);

  console.log(`\n🤖 Scoring top jobs with Gemini API...`);
  console.log(`(This may take 1-2 minutes)\n`);

  const results = [];
  let rateLimited = false;

  for (let i = 0; i < topJobs.length; i++) {
    const job = topJobs[i];
    const display = `${job.company} | ${job.title.substring(0, 50)}`;
    process.stdout.write(`[${i + 1}/${topJobs.length}] ${display}... `);

    try {
      const score = await scoreJobWithGemini(job.title, job.company, job.url);
      console.log(`✅ ${score.toFixed(1)}/5.0`);

      results.push({
        ...job,
        score,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      if (err.message.startsWith('RATE_LIMIT')) {
        console.log(`\n❌ RATE LIMITED\n`);
        rateLimited = true;
        break;
      }
      console.log(`❌ ${err.message}`);
    }

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (rateLimited) {
    console.error('❌ Gemini API rate limited - falling back to next method');
    process.exit(1);
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  // Save results
  fs.writeFileSync(
    'data/job-rankings-gemini.json',
    JSON.stringify(results, null, 2)
  );

  console.log(`\n\n✨ Top 5 Jobs:`);
  console.log('─'.repeat(80));

  results.slice(0, 5).forEach((job, i) => {
    console.log(
      `${i + 1}. [${job.score.toFixed(1)}/5.0] ${job.company} - ${job.title}`
    );
    console.log(`   ${job.url}\n`);
  });

  console.log(`\n📊 Full results saved to: data/job-rankings-gemini.json`);
  console.log(`\n✅ Ranking complete!`);
}

main().catch(console.error);
