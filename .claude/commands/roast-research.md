---
description: Pull your Meta ad stats and your niche's competitor ads into research/ for the Roast Room
argument-hint: <Ads Manager link or ad account ID> | <niche keywords> [| <country, default US>]
---

# /roast-research

Build a research bundle for the E-com Roast Room from the **Meta Ads connector** (the Meta ads MCP), then save it to `research/<account>-<YYYY-MM-DD>.json`. The dashboard's **Load ad data → Use latest research** button reads the newest file in `research/` (gitignored, because it holds private ad numbers).

Arguments: `$ARGUMENTS`
- An Ads Manager URL (take the number after `act=`) or a numeric ad account ID. If missing, call `ads_get_ad_accounts`, list the accounts that are queryable and ACTIVE with their last-30-day spend, and ask which one to use.
- Niche keywords for the competitor search (for example `sunset lamp projector`). If missing, infer 2-3 keyword phrases from the ad names, then confirm them with the user.
- Optional ISO-2 country for the Ad Library search (default `US`).

## Steps

1. **Your ads (read-only).** Call `ads_get_ad_entities` with `level: "ad"`, `date_preset: "last_30d"`, `sort: "amount_spent_descending"`, `filtering: [{field: "amount_spent", operator: "GREATER_THAN", value: ["0"]}]`, `limit: 300` and these fields (verify them first with `ads_get_field_context`): `name, campaign_name, adset_name, objective, effective_status, created_time, amount_spent, impressions, ctr, cpm, link_click, omni_add_to_cart, omni_purchase, omni_purchase_values, purchase_roas, video_continuous_2_sec_watched_actions, video_thruplay_watched_actions`. Follow `pagination.next_cursor` until all ads are fetched.
2. **Competitor ads.** Call `ads_library_search` with the niche keywords, `countries: [<country>]`, `ad_active_status: "ACTIVE"`, `limit: 50`. Run at most 3 searches (one per keyword phrase). Do not bulk-scrape. Drop the user's own pages. Keep `page_name`, `ad_creative_link_title`, `ad_creative_body` if present, `ad_delivery_start_time` and `ad_snapshot_url`.
3. **Post-purchase survey (optional).** Ask whether they have post-purchase survey answers (Fairing, KnoCommerce, Shopify form, or a CSV). If they paste or point to them, include each answer as a string in `survey`. If not, leave `survey` empty; it can also be pasted in the dashboard later.
4. **Write the bundle** to `research/<account-name-slug>-<YYYY-MM-DD>.json` in exactly this shape (numbers as plain numbers, no currency objects):

```json
{
  "source": "meta-connector",
  "generatedAt": "<ISO timestamp>",
  "account": { "name": "<ad account name>", "currency": "<USD|SGD|...>" },
  "period": "last 30 days",
  "niche": "<keywords used>",
  "ads": [
    {
      "name": "", "campaign": "", "adset": "", "objective": "", "status": "",
      "spend": 0, "impressions": 0, "ctr": 0, "cpm": 0, "clicks": 0,
      "addToCart": 0, "purchases": 0, "revenue": 0, "roas": 0,
      "videoPlays3s": 0, "thruplays": 0,
      "stage": "TOF | MOF | BOF | ALL (optional: leave empty to let the Roast Room infer it from names)"
    }
  ],
  "competitors": [
    { "page_name": "", "ad_creative_link_title": "", "ad_creative_body": "", "ad_delivery_start_time": 0, "ad_snapshot_url": "" }
  ],
  "survey": ["<one post-purchase survey answer per string>"]
}
```

5. **Funnel stages.** The Roast Room infers TOF/MOF/BOF from campaign and ad set names (prospecting/broad/LAL → TOF, engagers/video viewers → MOF, retargeting/visitors/ATC/DPA → BOF, Advantage+ shopping → ALL). If the user's naming doesn't make the stage obvious, ask them and set `stage` on each ad.
6. **Report back** in a few lines: the account, the period, total spend and purchases, spend split by funnel stage, the top 3 competitor pages by number of live ads, and the file path. Then tell them to open the Roast Room and click **Load ad data → Use latest research**.

## Rules
- Read-only: never create, edit, pause or activate anything in the ad account.
- Never put access tokens, emails or personal data in the file.
- Meta doesn't publish spend for commercial ads, so never claim a competitor's spend. The Roast Room ranks competitor ads by days running and live variants instead.
