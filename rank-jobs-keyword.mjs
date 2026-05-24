#!/usr/bin/env node

/**
 * Keyword-based job ranker (no API needed)
 * Fast scoring using profile keywords and relevance heuristics
 */

import fs from 'fs';
import yaml from 'js-yaml';

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
console.log(`   Focus: Deep Learning & Computer Vision`);

// Load jobs
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

// Scoring algorithm
function scoreJob(job) {
  const text = `${job.title} ${job.company}`.toLowerCase();
  let score = 2.0; // Base score

  // High-value keywords (+0.5 each)
  const highValue = [
    'deep learning', 'machine learning', 'neural network', 'ai', 'künstliche intelligenz',
    'computer vision', 'bildverarbeitung', 'image processing', 'dl', 'ml',
    'python', 'pytorch', 'tensorflow', 'keras', 'cv', 'nlp', 'genai', 'llm',
    'data science', 'datascience', 'ki'
  ];

  // Medium-value keywords (+0.25 each)
  const mediumValue = [
    'engineering', 'research', 'development', 'data', 'software', 'developer',
    'learning', 'intelligent', 'automation', 'algorithm', 'training',
    'model', 'inference', 'optimization', 'sensor', 'vision'
  ];

  // Negative keywords (-0.5 each)
  const negative = [
    'frontend', 'ui', 'ux', 'react', 'angular', 'web development', 'webentwicklung',
    'devops', 'infrastructure', 'database admin', 'sysadmin', 'marketing', 'hr',
    'accounting', 'finance', 'sales', 'hr business'
  ];

  // Scoring
  for (const keyword of highValue) {
    if (text.includes(keyword)) score += 0.5;
  }

  for (const keyword of mediumValue) {
    if (text.includes(keyword)) score += 0.25;
  }

  for (const keyword of negative) {
    if (text.includes(keyword)) score -= 0.5;
  }

  // Cap between 0-5
  return Math.max(0, Math.min(5.0, score));
}

// Main
console.log(`\n🔍 Analyzing ${loadJobs().length} jobs...`);

const allJobs = loadJobs();
const scored = allJobs
  .map(job => ({
    ...job,
    score: scoreJob(job)
  }))
  .sort((a, b) => b.score - a.score);

// Save all results
fs.writeFileSync(
  'data/job-rankings-keyword.json',
  JSON.stringify(scored, null, 2)
);

console.log(`\n✨ Top 15 Best Matches:\n`);
console.log('Score | Company           | Title');
console.log('─────────────────────────────────────────────────────────────────────────────');

scored.slice(0, 15).forEach((job, i) => {
  const scoreStr = job.score.toFixed(1).padStart(3);
  const company = job.company.padEnd(20).substring(0, 20);
  const title = job.title.substring(0, 45).padEnd(45);
  console.log(`  ${scoreStr}  | ${company} | ${title}`);
});

console.log(`\n📊 Full results saved to: data/job-rankings-keyword.json`);
console.log(`\n✅ Quick ranking complete!`);
