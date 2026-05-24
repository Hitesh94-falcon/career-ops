// #!/usr/bin/env node

// /**
//  * Auto-ranking script with fallback chain
//  * Tries: Gemini → GitHub Models → Keyword-based
//  */

// import { execSync } from 'child_process';
// import fs from 'fs';

// console.log('🚀 Starting auto job ranking...\n');

// const rankers = [
//   {
//     name: 'Gemini API',
//     script: 'rank-jobs-gemini.mjs',
//     output: 'data/job-rankings-gemini.json'
//   },
//   {
//     name: 'GitHub Models API',
//     script: 'rank-jobs.mjs',
//     output: 'data/job-rankings-github.json'
//   },
//   {
//     name: 'Keyword-based (Fast)',
//     script: 'rank-jobs-keyword.mjs',
//     output: 'data/job-rankings-keyword.json'
//   }
// ];

// let success = false;

// for (const ranker of rankers) {
//   console.log(`\n📡 Trying: ${ranker.name}...`);
//   console.log('─'.repeat(60));
  
//   try {
//     // Run the script with timeout
//     execSync(`node ${ranker.script}`, {
//       stdio: 'inherit',
//       timeout: 180000 // 3 minutes
//     });
    
//     // Check if output was created
//     if (fs.existsSync(ranker.output)) {
//       console.log(`\n✅ ${ranker.name} succeeded!`);
//       console.log(`📊 Results saved to: ${ranker.output}`);
//       success = true;
//       break;
//     }
//   } catch (err) {
//     console.log(`\n⚠️  ${ranker.name} failed or rate-limited`);
//     console.log(`   Reason: ${err.message.split('\n')[0]}`);
//     console.log(`   Trying next method...\n`);
//     continue;
//   }
// }

// if (!success) {
//   console.error('\n❌ All ranking methods failed');
//   process.exit(1);
// }

// // Display top results
// console.log('\n\n' + '═'.repeat(80));
// console.log('✨ TOP 10 JOB MATCHES');
// console.log('═'.repeat(80) + '\n');

// // Find which output file exists
// let resultsFile = null;
// for (const ranker of rankers) {
//   if (fs.existsSync(ranker.output)) {
//     resultsFile = ranker.output;
//     break;
//   }
// }

// if (resultsFile) {
//   const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  
//   // Check if all scores are the same (indicates rate limiting)
//   const uniqueScores = new Set(results.map(j => j.score));
//   if (uniqueScores.size === 1 && results.length > 1) {
//     console.log('⚠️  All scores identical - API likely rate-limited');
//     console.log('🔄 Switching to keyword-based ranking for better differentiation...\n');
    
//     // Fall back to keyword ranking
//     try {
//       execSync('node rank-jobs-keyword.mjs', { stdio: 'inherit' });
//       resultsFile = 'data/job-rankings-keyword.json';
//     } catch (err) {
//       console.log('Continuing with current results...\n');
//     }
//   }
  
//   const finalResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
  
//   finalResults.slice(0, 10).forEach((job, i) => {
//     console.log(`${i + 1}. [${job.score.toFixed(1)}/5.0] ${job.company}`);
//     console.log(`   📝 ${job.title}`);
//     console.log(`   🔗 ${job.url}\n`);
//   });
  
//   console.log('═'.repeat(80));
//   console.log(`📊 Full results: ${resultsFile}`);
//   console.log(`\n✅ Job ranking complete! Next steps:`);
//   console.log(`   1. Review results in ${resultsFile}`);
//   console.log(`   2. Run: npm run gemini-eval.mjs "job_description" for detailed scoring`);
//   console.log(`   3. Visit top URLs to apply\n`);
// }

import { execSync } from 'child_process';
import fs from 'fs';

console.log('🚀 Starting auto job ranking...\n');

const rankers = [
  {
    name: 'Gemini API',
    script: 'rank-jobs-gemini.mjs',
    output: 'data/job-rankings-gemini.json'
  },
  {
    name: 'GitHub Models API',
    script: 'rank-jobs.mjs',
    output: 'data/job-rankings-github.json'
  },
  {
    name: 'Keyword-based (Fast)',
    script: 'rank-jobs-keyword.mjs',
    output: 'data/job-rankings-keyword.json'
  }
];

let success = false;

for (const ranker of rankers) {
  console.log(`\n📡 Trying: ${ranker.name}...`);
  console.log('─'.repeat(60));

  // Remove stale output file before running
  if (fs.existsSync(ranker.output)) {
    try {
      fs.unlinkSync(ranker.output);
    } catch (err) {
      console.log(`⚠️ Could not remove old output: ${err.message}`);
    }
  }

  try {
    execSync(`node ${ranker.script}`, {
      stdio: 'inherit',
      timeout: 180000
    });

    // Validate output exists and is not empty
    if (
      fs.existsSync(ranker.output) &&
      fs.statSync(ranker.output).size > 10
    ) {
      console.log(`\n✅ ${ranker.name} succeeded!`);
      console.log(`📊 Results saved to: ${ranker.output}`);
      success = true;
      break;
    } else {
      console.log(`⚠️ Output file invalid or empty`);
    }

  } catch (err) {
    console.log(`\n⚠️ ${ranker.name} failed or rate-limited`);

    if (err.message) {
      console.log(`Reason: ${err.message.split('\n')[0]}`);
    }

    console.log(`Trying next method...\n`);
    continue;
  }
}

if (!success) {
  console.error('\n❌ All ranking methods failed');
  process.exit(1);
}

console.log('\n\n' + '═'.repeat(80));
console.log('✨ TOP 10 JOB MATCHES');
console.log('═'.repeat(80) + '\n');

// Find generated results file
let resultsFile = null;

for (const ranker of rankers) {
  if (
    fs.existsSync(ranker.output) &&
    fs.statSync(ranker.output).size > 10
  ) {
    resultsFile = ranker.output;
    break;
  }
}

if (!resultsFile) {
  console.error('❌ No valid results file found');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

// Detect suspicious identical scores
const uniqueScores = new Set(results.map(j => j.score));

if (uniqueScores.size === 1 && results.length > 1) {
  console.log('⚠️ All scores identical');
  console.log('🔄 Likely API fallback behavior detected');

  // If not already keyword ranking, switch
  if (!resultsFile.includes('keyword')) {
    try {
      execSync('node rank-jobs-keyword.mjs', {
        stdio: 'inherit'
      });

      resultsFile = 'data/job-rankings-keyword.json';
    } catch (err) {
      console.log('⚠️ Keyword fallback failed');
    }
  }
}

const finalResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

finalResults.slice(0, 10).forEach((job, i) => {
  console.log(`${i + 1}. [${job.score.toFixed(1)}/5.0] ${job.company}`);
  console.log(`   📝 ${job.title}`);
  console.log(`   🔗 ${job.url}\n`);
});

console.log('═'.repeat(80));
console.log(`📊 Full results: ${resultsFile}`);

console.log(`\n✅ Job ranking complete!`);
console.log(`Next steps:`);
console.log(`1. Review results`);
console.log(`2. Apply to top matches`);
console.log(`3. Run detailed evaluation if needed\n`);