#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Batch evaluate jobs using Gemini
 * Reads URLs from data/pipeline.md and evaluates each one
 */

const PIPELINE_FILE = './data/pipeline.md';
const MAX_EVALS = process.argv[2] ? parseInt(process.argv[2]) : 10; // Default: first 10 jobs

// Parse pipeline.md to extract URLs
function extractJobsFromPipeline() {
  const content = fs.readFileSync(PIPELINE_FILE, 'utf-8');
  const lines = content.split('\n');
  
  const jobs = [];
  for (const line of lines) {
    // Match: - [ ] URL | Company | Title
    const match = line.match(/^\s*-\s*\[\s*\]\s+(https?[^\s|]+)\s*\|\s*([^|]+)\s*\|\s*(.+)$/);
    if (match) {
      const [, url, company, title] = match;
      jobs.push({
        url: url.trim(),
        company: company.trim(),
        title: title.trim()
      });
    }
  }
  
  return jobs;
}

// Main batch evaluation
async function runBatchEval() {
  const jobs = extractJobsFromPipeline();
  
  if (jobs.length === 0) {
    console.error('❌ No jobs found in pipeline.md');
    process.exit(1);
  }
  
  const jobsToEval = jobs.slice(0, MAX_EVALS);
  console.log(`\n📊 Batch Evaluation: ${jobsToEval.length}/${jobs.length} jobs`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  const results = [];
  
  for (let i = 0; i < jobsToEval.length; i++) {
    const job = jobsToEval[i];
    const progress = `[${i + 1}/${jobsToEval.length}]`;
    
    console.log(`${progress} Evaluating: ${job.title}`);
    console.log(`   Company: ${job.company}`);
    console.log(`   URL: ${job.url}`);
    
    try {
      // Call gemini:eval for this job
      execSync(`npm run gemini:eval "${job.url}"`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      results.push({ job, status: 'success' });
      console.log(`✅ Evaluated\n`);
    } catch (err) {
      results.push({ job, status: 'failed', error: err.message });
      console.log(`⚠️  Evaluation failed\n`);
    }
  }
  
  // Summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ Batch complete! Check reports/ directory for results`);
  console.log(`\n📋 Summary:`);
  console.log(`   - Evaluated: ${results.filter(r => r.status === 'success').length}`);
  console.log(`   - Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log(`\n💡 Next: Compare reports in reports/ directory to find best matches`);
}

runBatchEval().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
