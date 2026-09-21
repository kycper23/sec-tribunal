/**
 * Methodology — a static, honest account of how the numbers are produced,
 * written for someone who wants to check whether they can be trusted.
 * Every threshold below is transcribed from src/sec/forensics.ts, not
 * paraphrased. No client code, no data fetching: pure server-rendered prose.
 */
import type { Metadata } from 'next'
import { HomeButton } from '../components/home-button'

export const metadata: Metadata = {
  title: 'Methodology — SEC Tribunal',
  description: 'How the deterministic clerk scores, what it cannot do, and where the honest limits are.',
}

export default function MethodologyPage() {
  return (
    <main className="container">
      <HomeButton />
      <header className="masthead">
        <div className="eyebrow">Court Records · Full Disclosure</div>
        <h1>Methodology</h1>
        <p>How the numbers are made — and where they stop being trustworthy.</p>
      </header>

      <div className="speech">
      <article className="md">
        <h3>1. The clerk</h3>
        <p>
          Alongside the LLM tribunal, a deterministic scorer (&ldquo;the clerk&rdquo;) computes a
          0&ndash;100 score from pure arithmetic on annual XBRL figures. Five sub-scores, 20 points
          each. The exact thresholds, as coded:
        </p>
        <ul>
          <li>
            <strong>Growth</strong> — year-over-year revenue growth: &ge;15% scores 20; &ge;5%
            scores 16; &ge;0% scores 12; &ge;&minus;10% scores 6; below &minus;10% scores 2. If the
            latest revenue is still below its level from two fiscal years ago, the score is capped
            at 8 and a red flag is raised.
          </li>
          <li>
            <strong>Profitability</strong> — latest net margin: &ge;15% scores 20; &ge;8% scores
            16; &ge;2% scores 12; &ge;0% scores 8; a net loss scores 2 and raises a red flag. A
            margin change versus the prior year of at least +2 points adds 2; a drop of 2 points or
            more subtracts 2.
          </li>
          <li>
            <strong>Earnings quality</strong> — operating cash flow divided by net income: &ge;1.0
            scores 20; &ge;0.8 scores 16; &ge;0.5 scores 10 with an amber &ldquo;paper
            profits&rdquo; flag; below 0.5 scores 2 with a red flag. If net income is zero or
            negative while OCF is positive, the ratio is not comparable and the score is 12. If
            both are non-positive, the score is 2 with a red flag.
          </li>
          <li>
            <strong>Leverage</strong> — long-term debt over stockholders equity: &le;0.3 scores 20;
            &le;0.6 scores 16; &le;1.0 scores 12; &le;2.0 scores 8; above 2.0 scores 4. Zero or
            negative equity scores 2 outright with a red flag. Interest coverage (operating income
            over interest expense) then adjusts the result: above 15x floors the score at 17; 8x or
            more floors it at 14; below 2x caps it at 6 with a red flag.
          </li>
          <li>
            <strong>Liquidity</strong> — starts at 10. Positive operating cash flow adds 10;
            zero-or-negative OCF subtracts 5 and raises a red flag. If OCF is positive and
            long-term debt exists, a debt payback horizon (debt / OCF) under 2 years adds 6, and
            2&ndash;5 years adds 3. A cash balance that grew year over year adds 2; one that shrank
            subtracts 2 with an amber flag. The result is clamped to 0&ndash;20.
          </li>
        </ul>

        <h3>2. What the clerk cannot do</h3>
        <ul>
          <li>
            <strong>Missing data is never punished.</strong> Any sub-score whose inputs are absent
            or unusable degrades to a neutral 10/20 with an explanatory note — a company is never
            penalized for a tag its filer did not report.
          </li>
          <li>
            <strong>Financial companies (SIC 6000&ndash;6799)</strong> — banks, insurers, REITs —
            get neutral Leverage and Liquidity, no flags. For them these ratios mean something
            else: debt is structural, and operating cash flow swings with the loan and trading
            book, not with distress.
          </li>
          <li>
            <strong>Interest coverage</strong> is computed only when interest expense and operating
            income cover the same fiscal period. On a period mismatch, coverage is skipped and the
            leverage score is floored at neutral rather than penalized.
          </li>
          <li>
            <strong>Stale tags are labeled, not hidden.</strong> Any metric not reported for more
            than 400 days relative to the company&rsquo;s latest filing is marked STALE in the
            evidence brief, with the date it was last reported.
          </li>
        </ul>

        <h3>3. Blind Trial</h3>
        <p>
          In a Blind Trial the evidence record is sealed at a past date. The cutoff is keyed to the
          SEC <strong>filing date</strong> (<code>filed</code>), not the fiscal period end — a 10-K
          for a fiscal year ending December 31 typically only becomes public months later, and
          gating on the period end would leak knowledge nobody had at the time (look-ahead bias).
        </p>
        <p>
          The &ldquo;future&rdquo; shown at reveal is determined the opposite way: by the
          <strong> reporting period</strong>, not the filing date. This is deliberate — a later
          10-K carries a comparative column restating the prior year, so filtering the reveal by
          filing date alone would misclassify already-known periods as new information.
        </p>

        <h3>4. The Narrative Gap</h3>
        <p>
          The judge never sees the clerk&rsquo;s sub-scores, total, or flags: the forensic block is
          removed from the judge&rsquo;s evidence (<code>stripForensicsBlock</code>) before the
          model call is built. The rest of the exhibit — raw figures, derived ratios, the 8-K
          docket — survives intact. So when the tribunal&rsquo;s score and the clerk&rsquo;s score
          diverge, that gap measures independent judgment against independent arithmetic — not the
          model&rsquo;s agreement with a number it was shown.
        </p>

        <h3>5. Known limits</h3>
        <ul>
          <li>
            Free-trial counters and per-IP rate limits live in the memory of each serverless
            instance. They are not shared across instances and do not survive cold starts — treat
            them as a courtesy throttle, not an enforcement mechanism.
          </li>
          <li>
            The clerk cannot call the direction of revenue. It scores the filed record; it does not
            forecast.
          </li>
          <li>
            The 60-point threshold is a naive reference line, not a validated predictor. Nothing
            here has been backtested as an investment signal.
          </li>
          <li>
            There is no banking model. Financial institutions would need ROE, net interest margin,
            and capital ratios — the clerk has none of these, which is exactly why it stays neutral
            on their Leverage and Liquidity instead of pretending.
          </li>
          <li>
            Model calls run through Orbio under a shared budget: 120 requests per minute and 32
            concurrent requests. Heavy traffic queues or fails loudly rather than silently
            degrading the verdicts.
          </li>
        </ul>
      </article>
      </div>

      <footer className="footer">
        Data: SEC EDGAR XBRL companyfacts · Not investment advice.
      </footer>
    </main>
  )
}
