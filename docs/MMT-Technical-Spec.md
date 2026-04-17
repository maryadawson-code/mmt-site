# MMT Platform — Full Technical Implementation Specification
### ProposalPulse Premium + MarketPulse Signal Chain + Pursuit Score Engine
**Version 1.0 · April 17, 2026 · Hand to Developer**

---

## 0. CRITICAL — Do First (Deadline: July 31, 2026)

### 0.1 FPDS ATOM Feed Migration

**FPDS.gov decommissioned February 24, 2026. ATOM feed retires July 31, 2026.**

**Audit task:** Search `lib/federal-data-apis.js` for any calls to:
- `www.fpds.gov/fpdsng_cms/index.php/en/`
- Any URL containing `fpds.gov`
- Any Atom/RSS feed parsers consuming FPDS data

**Replace with:** SAM.gov Contract Awards Search API

```
Base URL: https://api.sam.gov/prod/contractdata/v1/
Search:   GET /contractawards?api_key={KEY}&keyword={TERM}&naicsCode={NAICS}&awardeeUEI={UEI}
```

**Auth:** SAM.gov System Account API key (NOT personal key)
- Apply at: sam.gov/workspace → System Accounts widget
- Permission needed: `Contract Data` → `Read Public`
- IP whitelisting required — add your server IPs at account creation
- Approval takes 2–4 weeks — **start immediately**
- Rate limit: 10,000 requests/day (Federal System Account)

**Key response fields:**
```json
{
  "awardId": "string",
  "awardDate": "YYYY-MM-DD",
  "awardAmount": "number",
  "awardeeUEI": "string",
  "awardeeName": "string",
  "awardeeCAGE": "string",
  "naicsCode": "string",
  "pscCode": "string",
  "contractingOffice": "string",
  "agencyId": "string",
  "periodOfPerformanceEndDate": "YYYY-MM-DD",
  "descriptionOfRequirement": "string",
  "setAside": "string",
  "placeOfPerformanceCity": "string",
  "placeOfPerformanceState": "string"
}
```

---

## 1. Architecture Overview

```
lib/
  federal-data-apis.js          ← EXISTING (migrate FPDS here)
  sam-contract-awards.js        ← NEW: replaces FPDS ATOM
  congress-api.js               ← NEW: Congress.gov v3
  govinfo-api.js                ← NEW: GovInfo.gov (J-books, NDAA)
  pubmed-api.js                 ← NEW: PubMed/NCBI E-utilities
  clinicaltrials-api.js         ← NEW: ClinicalTrials.gov v2
  usajobs-api.js                ← NEW: USAJobs hiring signals
  chpl-api.js                   ← NEW: ONC CHPL certification
  wage-determinations-api.js    ← NEW: SAM.gov SCA/DBA wages
  bls-api.js                    ← NEW: BLS OEWS labor rates
  sec-edgar-api.js              ← NEW: SEC contractor financials
  itdashboard-api.js            ← NEW: Federal IT Dashboard
  grants-api.js                 ← NEW: Grants.gov CDMRP/ARPA-H
  cms-provider-api.js           ← NEW: CMS hospital quality data
  signal-engine.js              ← NEW: Signal Chain scoring logic
  pursuit-score-engine.js       ← NEW: Bid/no-bid scoring logic
  compliance-checker.js         ← NEW: ProposalPulse Health IT compliance

services/
  paywall.js                    ← EXISTING (extend for new tiers)
  cache.js                      ← NEW: Redis/in-memory TTL cache
  nlp-extractor.js              ← NEW: extract product names, locations, NAICS from proposal text

database/
  tracked-programs.schema       ← NEW: programs users are monitoring
  signal-events.schema          ← NEW: fired signals log
  pursuit-scores.schema         ← NEW: cached pursuit score cards
  compliance-reports.schema     ← NEW: compliance check results

api/routes/
  /api/compliance-check         ← NEW: ProposalPulse premium endpoint
  /api/pursuit-score            ← NEW: Pursuit Score Engine endpoint
  /api/signal-chain             ← NEW: Signal Chain dashboard endpoint
  /api/programs/track           ← NEW: add/remove tracked programs
  /api/alerts                   ← NEW: user alert preferences
```

---

## 2. API Integration Modules

### 2.1 `lib/sam-contract-awards.js` — Replace FPDS

```javascript
// FPDS REPLACEMENT — migrate all existing FPDS calls here
// Endpoint: https://api.sam.gov/prod/contractdata/v1/contractawards

const SAM_CONTRACT_BASE = 'https://api.sam.gov/prod/contractdata/v1';
const SAM_SYSTEM_KEY = process.env.SAM_SYSTEM_ACCOUNT_API_KEY; // NOT personal key

/**
 * Search contract awards by keyword, NAICS, agency, or awardee UEI
 * Maps to old FPDS atom feed functionality
 */
async function searchContractAwards({
  keyword = null,
  naicsCode = null,
  agencyId = null,       // DHA = '97', VA = '36', HHS = '75'
  awardeeUEI = null,
  dateFrom = null,       // YYYY-MM-DD
  dateTo = null,
  minAmount = null,
  setAside = null,       // 'SBA','SDVOSBC','8A', etc.
  pscCode = null,        // PSC codes for health IT: Q, AD, AJ, 7010, 7030
  limit = 20,
  offset = 0
}) {
  const params = new URLSearchParams({ api_key: SAM_SYSTEM_KEY, limit, offset });
  if (keyword)    params.set('keyword', keyword);
  if (naicsCode)  params.set('naicsCode', naicsCode);
  if (agencyId)   params.set('agencyId', agencyId);
  if (awardeeUEI) params.set('awardeeUEI', awardeeUEI);
  if (dateFrom)   params.set('awardDateFrom', dateFrom);
  if (dateTo)     params.set('awardDateTo', dateTo);
  if (minAmount)  params.set('awardAmountFrom', minAmount);
  if (setAside)   params.set('setAside', setAside);
  if (pscCode)    params.set('pscCode', pscCode);

  const res = await fetch(`${SAM_CONTRACT_BASE}/contractawards?${params}`);
  if (!res.ok) throw new Error(`SAM Contract Awards API ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Get award expiration tracking — for recompete window alerts
 * Returns contracts expiring within X days
 */
async function getExpiringContracts({ agencyId, naicsCode, daysUntilExpiry = 365 }) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
  return searchContractAwards({
    agencyId,
    naicsCode,
    dateTo: expiryDate.toISOString().split('T')[0]
  });
}

/**
 * Get incumbent history for a specific solicitation number or program
 */
async function getIncumbentHistory({ solicitationNumber, programKeyword }) {
  return searchContractAwards({
    keyword: solicitationNumber || programKeyword,
    limit: 50
  });
}

module.exports = { searchContractAwards, getExpiringContracts, getIncumbentHistory };
```

---

### 2.2 `lib/congress-api.js` — Congress.gov v3

```javascript
// Auth: Free API key from api.data.gov (same key works for GovInfo)
// Register: https://api.data.gov/signup/
// Rate limit: 1,000 requests/hour with key

const CONGRESS_BASE = 'https://api.congress.gov/v3';
const CONGRESS_KEY = process.env.CONGRESS_API_KEY;

// DHA/VA/HHS-relevant committee codes
const TARGET_COMMITTEES = {
  HASC_READINESS: 'hsas14',
  HAC_DEFENSE:    'hsap02',
  HVAC:           'hsvr00',
  SASC:           'ssas00',
  SAC_DEFENSE:    'ssap03',
};

/**
 * Get bills mentioning health IT keywords
 */
async function searchBills({ query, congress = 119, limit = 20, offset = 0 }) {
  const params = new URLSearchParams({ api_key: CONGRESS_KEY, query, limit, offset });
  const res = await fetch(`${CONGRESS_BASE}/bill/${congress}?${params}`);
  if (!res.ok) throw new Error(`Congress API bills ${res.status}`);
  return res.json();
}

/**
 * Get committee hearings — HASC Readiness and HAC-D are highest priority
 */
async function getCommitteeHearings({ congress = 119, committeeCode, limit = 20 }) {
  const params = new URLSearchParams({ api_key: CONGRESS_KEY, limit });
  const url = committeeCode
    ? `${CONGRESS_BASE}/hearing/${congress}/committee/${committeeCode}?${params}`
    : `${CONGRESS_BASE}/hearing/${congress}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress API hearings ${res.status}`);
  return res.json();
}

/**
 * Get CRS reports — newly accessible as of March 2025
 */
async function getCRSReports({ query, limit = 10 }) {
  const params = new URLSearchParams({ api_key: CONGRESS_KEY, query, limit });
  const res = await fetch(`${CONGRESS_BASE}/crsreports?${params}`);
  if (!res.ok) throw new Error(`Congress API CRS ${res.status}`);
  return res.json();
}

/**
 * Track specific bill status — for NDAA markup, appropriations bill progress
 */
async function getBillStatus({ billType, billNumber, congress = 119 }) {
  const params = new URLSearchParams({ api_key: CONGRESS_KEY });
  const res = await fetch(`${CONGRESS_BASE}/bill/${congress}/${billType}/${billNumber}?${params}`);
  if (!res.ok) throw new Error(`Congress API bill status ${res.status}`);
  return res.json();
}

module.exports = { searchBills, getCommitteeHearings, getCRSReports, getBillStatus, TARGET_COMMITTEES };
```

---

### 2.3 `lib/govinfo-api.js` — GovInfo (Budget J-Books, NDAA, Hearings)

```javascript
// Same api.data.gov key as Congress.gov
// Collections of highest value for MMT: BUDGET, BILLS, CHRG, CREC, CPD

const GOVINFO_BASE = 'https://api.govinfo.gov';
const GOVINFO_KEY = process.env.CONGRESS_API_KEY; // same key as Congress.gov

/**
 * Search GovInfo by keyword
 */
async function searchDocuments({ query, collections = [], dateIssuedStart = null, limit = 20 }) {
  const params = new URLSearchParams({
    api_key: GOVINFO_KEY,
    query,
    pageSize: limit,
    offsetMark: '*'
  });
  if (collections.length) params.set('collections', collections.join(','));
  if (dateIssuedStart)    params.set('dateIssuedStart', dateIssuedStart);

  const res = await fetch(`${GOVINFO_BASE}/search?${params}`);
  if (!res.ok) throw new Error(`GovInfo search ${res.status}`);
  return res.json();
}

/**
 * Get budget justification books — DHA J-books, VA budget request, HHS budget docs
 * Collection: BUDGET
 */
async function getBudgetDocuments({ fiscalYear, agencyCode = null, keyword = null }) {
  return searchDocuments({
    query: keyword || `budget justification ${fiscalYear} ${agencyCode || ''}`.trim(),
    collections: ['BUDGET'],
    limit: 10
  });
}

/**
 * Get NDAA full text by section keyword
 */
async function getNDAAText({ congress = 119, keyword }) {
  return searchDocuments({
    query: `${keyword} national defense authorization`,
    collections: ['BILLS'],
    limit: 5
  });
}

/**
 * Get congressional hearing transcripts
 * Collection: CHRG
 */
async function getHearingTranscripts({ keyword, dateFrom = null }) {
  return searchDocuments({
    query: keyword,
    collections: ['CHRG'],
    dateIssuedStart: dateFrom,
    limit: 10
  });
}

/**
 * Get document full text by package ID
 */
async function getDocumentText({ packageId }) {
  const res = await fetch(`${GOVINFO_BASE}/packages/${packageId}/summary?api_key=${GOVINFO_KEY}`);
  if (!res.ok) throw new Error(`GovInfo package ${res.status}`);
  return res.json();
}

module.exports = { searchDocuments, getBudgetDocuments, getNDAAText, getHearingTranscripts, getDocumentText };
```

---

### 2.4 `lib/pubmed-api.js` — PubMed/NCBI E-utilities

```javascript
// No auth required for <3 req/sec; API key for higher volume
// Register: https://www.ncbi.nlm.nih.gov/account/ (free)

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const NCBI_KEY = process.env.NCBI_API_KEY || '';

/**
 * Search PubMed — returns PMIDs
 */
async function searchPubMed({ query, maxResults = 20, dateSince = null }) {
  const params = new URLSearchParams({
    db: 'pubmed', term: query, retmax: maxResults, retmode: 'json', sort: 'date'
  });
  if (NCBI_KEY)  params.set('api_key', NCBI_KEY);
  if (dateSince) { params.set('mindate', dateSince); params.set('datetype', 'pdat'); }

  const res = await fetch(`${NCBI_BASE}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed search ${res.status}`);
  return res.json();
}

/**
 * Fetch article abstracts and metadata by PMIDs
 */
async function fetchArticleDetails({ pmids }) {
  const params = new URLSearchParams({
    db: 'pubmed', id: pmids.join(','), retmode: 'json', rettype: 'abstract'
  });
  if (NCBI_KEY) params.set('api_key', NCBI_KEY);
  const res = await fetch(`${NCBI_BASE}/efetch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed fetch ${res.status}`);
  return res.json();
}

/**
 * Get article summaries — lighter payload, ideal for citation cards
 */
async function getArticleSummaries({ pmids }) {
  const params = new URLSearchParams({ db: 'pubmed', id: pmids.join(','), retmode: 'json' });
  if (NCBI_KEY) params.set('api_key', NCBI_KEY);
  const res = await fetch(`${NCBI_BASE}/esummary.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed summary ${res.status}`);
  return res.json();
}

/**
 * Find supporting evidence for a clinical claim — used by compliance-checker.js
 */
async function findEvidenceForClaim({ claim, meshTerms = [], maxResults = 5 }) {
  const termParts = [claim];
  if (meshTerms.length) termParts.push(meshTerms.map(t => `${t}[MeSH]`).join(' OR '));
  const { esearchresult } = await searchPubMed({ query: termParts.join(' AND '), maxResults });
  if (!esearchresult?.idlist?.length) return [];
  return getArticleSummaries({ pmids: esearchresult.idlist });
}

module.exports = { searchPubMed, fetchArticleDetails, getArticleSummaries, findEvidenceForClaim };
```

---

### 2.5 `lib/clinicaltrials-api.js` — ClinicalTrials.gov v2

```javascript
// No auth required. v1 retired June 2024 — use v2 only.
// Base: https://clinicaltrials.gov/api/v2/

const CT_BASE = 'https://clinicaltrials.gov/api/v2';

const FEDERAL_HEALTH_SPONSORS = [
  'Defense Health Agency', 'Department of Defense', 'U.S. Army',
  'U.S. Air Force', 'U.S. Navy', 'Military',
  'Department of Veterans Affairs', 'VA',
  'National Institutes of Health', 'HHS', 'BARDA', 'ARPA-H'
];

/**
 * Search trials
 * STATUS VALUES: 'RECRUITING' | 'ACTIVE_NOT_RECRUITING' | 'COMPLETED' | 'ENROLLING_BY_INVITATION'
 * COMPLETED = highest-value status for signal chain (procurement signal 12-24 months out)
 */
async function searchTrials({
  query = null, sponsor = null, status = null,
  condition = null, intervention = null,
  pageSize = 20, pageToken = null
}) {
  const params = new URLSearchParams({ pageSize, format: 'json' });
  if (query)       params.set('query.term', query);
  if (sponsor)     params.set('query.spons', sponsor);
  if (status)      params.set('filter.overallStatus', status);
  if (condition)   params.set('query.cond', condition);
  if (intervention) params.set('query.intr', intervention);
  if (pageToken)   params.set('pageToken', pageToken);

  const res = await fetch(`${CT_BASE}/studies?${params}`);
  if (!res.ok) throw new Error(`ClinicalTrials API ${res.status}`);
  return res.json();
}

/**
 * Get recently completed DHA/VA-sponsored trials — Signal Chain Layer 1
 */
async function getRecentlyCompletedFederalHealthTrials({ daysSince = 90 }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysSince);
  const results = await Promise.all(
    FEDERAL_HEALTH_SPONSORS.map(sponsor => searchTrials({ sponsor, status: 'COMPLETED' }))
  );
  const seen = new Set();
  return results
    .flatMap(r => r.studies || [])
    .filter(study => {
      const id = study.protocolSection?.identificationModule?.nctId;
      if (seen.has(id)) return false;
      seen.add(id);
      const completionDate = study.protocolSection?.statusModule?.completionDateStruct?.date;
      return completionDate && new Date(completionDate) >= cutoff;
    });
}

async function getTrialById({ nctId }) {
  const res = await fetch(`${CT_BASE}/studies/${nctId}?format=json`);
  if (!res.ok) throw new Error(`ClinicalTrials detail ${res.status}`);
  return res.json();
}

module.exports = { searchTrials, getRecentlyCompletedFederalHealthTrials, getTrialById };
```

---

### 2.6 `lib/usajobs-api.js` — USAJobs Hiring Signal

```javascript
// Register: https://developer.usajobs.gov/APIRequest/Index
// Required headers: Authorization (API key), Host (your app host string)

const USAJOBS_BASE = 'https://data.usajobs.gov/api/search';

const TARGET_AGENCIES = {
  DHA:   'AF52',
  VA:    'VATA',
  HHS:   'HE00',
  ONC:   'HE38',
  NIH:   'HE06',
  BARDA: 'HE07'
};

async function searchJobs({
  keywords = null, organizationCode = null, positionTitle = null,
  resultCount = 25, page = 1
}) {
  const headers = {
    'Authorization': process.env.USAJOBS_API_KEY,
    'Host': process.env.USAJOBS_HOST || 'missionmeetstech.com',
    'User-Agent': 'MissionMeetsTech/1.0'
  };
  const params = new URLSearchParams({ ResultsPerPage: resultCount, Page: page });
  if (keywords)         params.set('Keyword', keywords);
  if (organizationCode) params.set('OrganizationCode', organizationCode);
  if (positionTitle)    params.set('PositionTitle', positionTitle);

  const res = await fetch(`${USAJOBS_BASE}?${params}`, { headers });
  if (!res.ok) throw new Error(`USAJobs API ${res.status}`);
  return res.json();
}

/**
 * Monitor hiring surge — spike detection for Signal Chain Layer 3
 */
async function getHiringSurgeData({ agencyCode, keywords, daysSince = 30 }) {
  const results = await searchJobs({ organizationCode: agencyCode, keywords, resultCount: 250 });
  const jobs = results.SearchResult?.SearchResultItems || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysSince);
  return jobs.filter(job => {
    const posted = job.MatchedObjectDescriptor?.PublicationStartDate;
    return posted && new Date(posted) >= cutoff;
  });
}

module.exports = { searchJobs, getHiringSurgeData, TARGET_AGENCIES };
```

---

### 2.7 `lib/chpl-api.js` — ONC CHPL Certification Verification

```javascript
// No auth required. Public REST API.
// Swagger: https://chpl.healthit.gov/rest/swagger-ui/index.html

const CHPL_BASE = 'https://chpl.healthit.gov/rest';

async function searchProduct({ productName, developer = null }) {
  const params = new URLSearchParams({ productName, pageSize: 10 });
  if (developer) params.set('developer', developer);
  const res = await fetch(`${CHPL_BASE}/collections/certified-products?${params}`);
  if (!res.ok) throw new Error(`CHPL API ${res.status}`);
  return res.json();
}

async function getProductListing({ chplId }) {
  const res = await fetch(`${CHPL_BASE}/certified_products/${chplId}`);
  if (!res.ok) throw new Error(`CHPL listing ${res.status}`);
  return res.json();
}

/**
 * Verify named product — primary function called by compliance-checker.js
 */
async function verifyProductCertification({ productName, developer }) {
  const results = await searchProduct({ productName, developer });
  const listings = results.results || [];
  if (!listings.length) return { certified: false, productName, developer };

  const active = listings.find(l => l.certificationStatus?.name === 'Active');
  const listing = active || listings[0];
  return {
    certified: listing.certificationStatus?.name === 'Active',
    edition: listing.certificationEdition?.name,
    status: listing.certificationStatus?.name,
    chplId: listing.chplProductNumber,
    developer: listing.developer?.name,
    productName: listing.product?.name,
    criteriaCount: listing.countCertificationCriteria || 0,
    lastModified: listing.lastModifiedDate
  };
}

module.exports = { searchProduct, getProductListing, verifyProductCertification };
```

---

### 2.8 `lib/wage-determinations-api.js` — SCA/DBA Wage Floors

```javascript
// SAM.gov Wage Determinations — public, personal API key
// Base: https://api.sam.gov/wage-determinations

const WD_BASE = 'https://api.sam.gov/wage-determinations';
const SAM_PUBLIC_KEY = process.env.SAM_PUBLIC_API_KEY;

async function getWageDetermination({ state, county, wdType = 'SCA', keyword = null }) {
  const params = new URLSearchParams({ api_key: SAM_PUBLIC_KEY, wdType, state, county, limit: 5 });
  if (keyword) params.set('keyword', keyword);
  const res = await fetch(`${WD_BASE}?${params}`);
  if (!res.ok) throw new Error(`Wage Determination API ${res.status}`);
  return res.json();
}

/**
 * Map proposal labor categories to SCA occupation groups and get wage floor
 */
async function getWageFloorForLaborCategory({ jobTitle, state, county }) {
  const occupationKeywords = {
    'software engineer':    'Computer Systems Analyst',
    'systems analyst':      'Computer Systems Analyst',
    'program manager':      'Professional',
    'clinical informatics': 'Health',
    'data analyst':         'Computer Operator',
    'project manager':      'Professional',
    'technical writer':     'Technical',
    'network engineer':     'Computer Network Specialist'
  };
  const normalizedTitle = jobTitle.toLowerCase();
  const keyword = Object.entries(occupationKeywords)
    .find(([k]) => normalizedTitle.includes(k))?.[1] || jobTitle;
  return getWageDetermination({ state, county, keyword });
}

module.exports = { getWageDetermination, getWageFloorForLaborCategory };
```

---

### 2.9 `lib/sec-edgar-api.js` — Competitor Financial Intelligence

```javascript
// No auth required. Free public API.
// Base: https://data.sec.gov/

const EDGAR_BASE = 'https://data.sec.gov';

// Major federal health IT contractors — pre-mapped CIK numbers
const CONTRACTOR_CIKS = {
  'Leidos':        '1336920',
  'Booz Allen':    '1443646',
  'Oracle':        '1341439',
  'DXC Technology':'1688568',
  'Evolent Health':'1628301',
  'Humana':        '49071',
  'Accenture':     '1467373'
};

async function getCompanySubmissions({ cik }) {
  const paddedCIK = String(cik).padStart(10, '0');
  const res = await fetch(`${EDGAR_BASE}/submissions/CIK${paddedCIK}.json`);
  if (!res.ok) throw new Error(`EDGAR submissions ${res.status}`);
  return res.json();
}

async function getCompanyFacts({ cik }) {
  const paddedCIK = String(cik).padStart(10, '0');
  const res = await fetch(`${EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCIK}.json`);
  if (!res.ok) throw new Error(`EDGAR facts ${res.status}`);
  return res.json();
}

async function getLatest10K({ cik }) {
  const subs = await getCompanySubmissions({ cik });
  const filings = subs.filings?.recent;
  if (!filings) return null;
  const idx = filings.form.findIndex(f => f === '10-K');
  if (idx === -1) return null;
  return {
    accessionNumber: filings.accessionNumber[idx],
    filingDate: filings.filingDate[idx],
    reportDate: filings.reportDate[idx]
  };
}

async function lookupCIK({ companyName }) {
  const params = new URLSearchParams({ q: `"${companyName}"`, dateRange: 'custom', startdt: '2020-01-01' });
  const res = await fetch(`https://efts.sec.gov/LATEST/search-index?${params}`);
  if (!res.ok) throw new Error(`EDGAR CIK lookup ${res.status}`);
  return res.json();
}

module.exports = { getCompanySubmissions, getCompanyFacts, getLatest10K, lookupCIK, CONTRACTOR_CIKS };
```

---

### 2.10 Abbreviated Specs — Remaining Integrations

**`lib/grants-api.js`** — Grants.gov (CDMRP, ARPA-H, BARDA)
```
POST https://api.grants.gov/v2/api/search2
Body: { keyword, agency: ['DOD','HHS','ARPA-H'], oppStatuses: 'forecasted|posted' }
No auth for search.
Returns: opportunityNumber, title, agency, closeDate, awardFloor, awardCeiling
```

**`lib/bls-api.js`** — BLS OEWS Labor Rates
```
POST https://api.bls.gov/publicAPI/v2/timeseries/data/
Body: { seriesid: ['OEWS{areaCode}{occCode}0000003'], startyear, endyear }
API key: process.env.BLS_API_KEY (free, register at bls.gov/developers)
Returns: hourly mean, 10th/25th/75th/90th percentile wages by SOC code + metro area
```

**`lib/cms-provider-api.js`** — CMS Provider Data (Hospital Quality)
```
GET https://data.cms.gov/provider-data/api/1/datastore/sql
Params: query=SELECT * FROM {datasetId} WHERE facility_name LIKE '%{name}%' LIMIT 20
No auth.
Dataset IDs: hospitals='v2rg-p566'
Returns: safety measures, HCAHPS scores, readmission rates
```

**`lib/itdashboard-api.js`** — Federal IT Dashboard
```
GET https://itdashboard.gov/api/v1/investments/list.json
Params: agencyCode={97=DoD, 36=VA}, status=active
Returns: investmentId, programName, totalFYSpending, cpiRating, spiRating
Rating: 1=Adequate, 2=Needs Attention, 3=Significant Concerns — key for pursuit scoring
```

---

## 3. Core Feature Modules

### 3.1 `services/nlp-extractor.js` — Extract Proposal Elements

```javascript
// Uses existing OpenAI/Claude API in your stack
// Extracts structured data from uploaded proposal text for compliance checking

async function extractProposalElements(proposalText) {
  const prompt = `
    Analyze this federal proposal text and extract as JSON:
    {
      "healthITProducts": ["named health IT products, EHR systems, platforms"],
      "laborCategories": [{"title": "string", "hourlyRate": number|null, "location": "city, state|null"}],
      "performanceLocations": ["city, state"],
      "clinicalClaims": ["clinical outcome claims requiring evidence"],
      "certificationsMentioned": ["HIPAA BAA", "HITRUST", "FedRAMP", "CMMC", "ATO"],
      "naicsCodes": ["6-digit codes if mentioned"],
      "pscCodes": ["4-char codes if mentioned"],
      "programsReferenced": ["DHA GENESIS", "VA EHRM", etc.],
      "contractVehicles": ["ITES-SW2", "SEWP", etc.]
    }
    Proposal text: ${proposalText.substring(0, 15000)}
  `;
  return callAIService(prompt); // your existing AI service call
}

module.exports = { extractProposalElements };
```

---

### 3.2 `lib/compliance-checker.js` — ProposalPulse Premium: Health IT Compliance Checker

**Pricing:** $49.99/assessment or $299/month unlimited

```javascript
const { verifyProductCertification } = require('./chpl-api');
const { getWageFloorForLaborCategory } = require('./wage-determinations-api');
const { findEvidenceForClaim } = require('./pubmed-api');

/**
 * MAIN ENTRY POINT
 * Input: result of extractProposalElements()
 * Output: ComplianceReport object
 */
async function runComplianceCheck({ extractedElements, proposalText }) {
  const [certChecks, wageChecks, evidenceChecks, docChecks] = await Promise.allSettled([
    checkONCCertifications(extractedElements.healthITProducts),
    checkWageCompliance(extractedElements.laborCategories),
    checkClinicalEvidence(extractedElements.clinicalClaims),
    checkDocumentationFlags(extractedElements.certificationsMentioned, proposalText)
  ]);

  return {
    timestamp: new Date().toISOString(),
    overallRisk: calculateOverallRisk(certChecks, wageChecks, evidenceChecks, docChecks),
    sections: {
      oncCertification:  certChecks.value  || { error: certChecks.reason?.message },
      wageCompliance:    wageChecks.value  || { error: wageChecks.reason?.message },
      clinicalEvidence:  evidenceChecks.value || { error: evidenceChecks.reason?.message },
      documentationGaps: docChecks.value   || { error: docChecks.reason?.message }
    }
  };
}

// --- Check 1: ONC CHPL Certification ---
async function checkONCCertifications(products) {
  const results = await Promise.all(
    products.map(async (productName) => {
      try {
        const cert = await verifyProductCertification({ productName });
        return {
          product: productName,
          status: cert.certified ? 'VERIFIED' : 'NOT_FOUND',
          edition: cert.edition,
          certificationStatus: cert.status,
          chplId: cert.chplId,
          flag: !cert.certified ? 'RISK: Product certification not verified in CHPL' : null,
          severity: !cert.certified ? 'HIGH' : 'PASS'
        };
      } catch (e) {
        return { product: productName, status: 'LOOKUP_ERROR', flag: e.message, severity: 'MEDIUM' };
      }
    })
  );
  return { checks: results, failCount: results.filter(r => r.severity === 'HIGH').length };
}

// --- Check 2: SCA/DBA Wage Floor ---
async function checkWageCompliance(laborCategories) {
  const ratedCategories = laborCategories.filter(lc => lc.hourlyRate && lc.location);
  const results = await Promise.all(
    ratedCategories.map(async (lc) => {
      try {
        const [city, state] = lc.location.split(',').map(s => s.trim());
        const wd = await getWageFloorForLaborCategory({ jobTitle: lc.title, state });
        const wdMinimum = wd?.wageRates?.[0]?.wage;
        if (!wdMinimum) return { category: lc.title, status: 'NO_WD_FOUND', severity: 'LOW' };
        const compliant = lc.hourlyRate >= wdMinimum;
        return {
          category: lc.title,
          proposedRate: lc.hourlyRate,
          scaFloor: wdMinimum,
          location: lc.location,
          compliant,
          flag: !compliant
            ? `RISK: $${lc.hourlyRate}/hr is below SCA floor of $${wdMinimum}/hr`
            : null,
          severity: !compliant ? 'CRITICAL' : 'PASS'
        };
      } catch (e) {
        return { category: lc.title, status: 'LOOKUP_ERROR', severity: 'LOW' };
      }
    })
  );
  return { checks: results, criticalCount: results.filter(r => r.severity === 'CRITICAL').length };
}

// --- Check 3: Clinical Evidence Grounding ---
async function checkClinicalEvidence(clinicalClaims) {
  const results = await Promise.all(
    clinicalClaims.map(async (claim) => {
      try {
        const evidence = await findEvidenceForClaim({ claim, maxResults: 3 });
        const articles = Object.values(evidence.result || {}).slice(0, 3);
        return {
          claim: claim.substring(0, 100),
          evidenceFound: articles.length > 0,
          citations: articles.map(a => ({
            pmid: a.uid, title: a.title, journal: a.source, year: a.pubdate?.split(' ')[0]
          })),
          flag: !articles.length
            ? 'SUGGESTION: No peer-reviewed evidence found — add citation to strengthen technical credibility'
            : null,
          severity: !articles.length ? 'MEDIUM' : 'PASS'
        };
      } catch (e) {
        return { claim: claim.substring(0, 100), evidenceFound: false, severity: 'LOW' };
      }
    })
  );
  return { checks: results };
}

// --- Check 4: Required Documentation Flags ---
function checkDocumentationFlags(certsMentioned, proposalText) {
  const text = proposalText.toLowerCase();
  const requirements = [
    { name: 'HIPAA BAA',         keywords: ['hipaa baa', 'business associate agreement', 'baa'], required: true },
    { name: 'FedRAMP Authorization', keywords: ['fedramp', 'fedramp authorized', 'fedramp moderate'], required: true },
    { name: 'CMMC Level',        keywords: ['cmmc', 'cybersecurity maturity model'], required: true },
    { name: 'ATO Reference',     keywords: ['authority to operate', 'ato', 'iatt'], required: true },
    { name: 'HITRUST',           keywords: ['hitrust', 'csf certified'], required: false },
    { name: 'SOC 2 Type II',     keywords: ['soc 2', 'soc2'], required: false }
  ];
  const results = requirements.map(req => {
    const mentioned = req.keywords.some(kw => text.includes(kw)) ||
                      certsMentioned.some(c => c.toLowerCase().includes(req.name.toLowerCase()));
    return {
      documentation: req.name, mentioned, required: req.required,
      flag: req.required && !mentioned
        ? `RISK: ${req.name} not referenced — typically required for federal health IT proposals`
        : null,
      severity: req.required && !mentioned ? 'HIGH' : 'PASS'
    };
  });
  return { checks: results, missingRequired: results.filter(r => r.severity === 'HIGH').length };
}

function calculateOverallRisk(certChecks, wageChecks, evidenceChecks, docChecks) {
  const criticals = [
    certChecks.value?.failCount || 0,
    wageChecks.value?.criticalCount || 0,
    docChecks.value?.missingRequired || 0
  ].reduce((a, b) => a + b, 0);
  if (criticals >= 3) return 'HIGH';
  if (criticals >= 1) return 'MEDIUM';
  return 'LOW';
}

module.exports = { runComplianceCheck };
```

---

### 3.3 `lib/pursuit-score-engine.js` — Pursuit Score Engine

**Pricing:** $99–$149/month

```javascript
const { searchContractAwards, getIncumbentHistory } = require('./sam-contract-awards');
const { getBudgetDocuments } = require('./govinfo-api');
const { searchBills } = require('./congress-api');
const { getRecentlyCompletedFederalHealthTrials } = require('./clinicaltrials-api');
const { searchPubMed } = require('./pubmed-api');

/**
 * MAIN ENTRY POINT — Score a pursuit opportunity (0–100)
 */
async function scorePursuit({ keyword, agencyId, naicsCode }) {
  const [incumbentData, budgetData, legislativeData, researchData] = await Promise.allSettled([
    getIncumbentHistory({ programKeyword: keyword }),
    getBudgetDocuments({ keyword, fiscalYear: 'FY2027' }),
    searchBills({ query: keyword }),
    getPipelineResearchSignal({ keyword })
  ]);

  const scores = {
    incumbentVulnerability: scoreIncumbent(incumbentData.value),     // 0-25
    marketTiming:           scoreMarketTiming(incumbentData.value),  // 0-25
    agencySpendHealth:      scoreBudgetHealth(budgetData.value),     // 0-25
    researchPipeline:       scoreResearchPipeline(researchData.value) // 0-25
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const tier = total >= 70 ? 'STRONG PURSUE'
             : total >= 45 ? 'PURSUE WITH CAUTION'
             : 'NO BID / MONITOR';

  return {
    opportunityKeyword: keyword, agencyId, naicsCode,
    overallScore: total, tier,
    components: scores,
    narrative: buildNarrative(scores, tier),
    generatedAt: new Date().toISOString()
  };
}

function scoreIncumbent(awardData) {
  if (!awardData?.results?.length) return 12;
  const mostRecent = awardData.results[0];
  const yearsOnContract = mostRecent?.awardDate
    ? (Date.now() - new Date(mostRecent.awardDate)) / (365 * 24 * 3600 * 1000)
    : 3;
  return Math.min(25, Math.round(yearsOnContract * 4));
}

function scoreMarketTiming(awardData) {
  if (!awardData?.results?.length) return 10;
  const expiryDate = new Date(awardData.results[0]?.periodOfPerformanceEndDate);
  const monthsUntilExpiry = (expiryDate - Date.now()) / (30 * 24 * 3600 * 1000);
  if (monthsUntilExpiry >= 12 && monthsUntilExpiry <= 24) return 22;
  if (monthsUntilExpiry > 24) return 14;
  if (monthsUntilExpiry >= 6) return 10;
  return 5;
}

function scoreBudgetHealth(budgetData) {
  const text = JSON.stringify(budgetData || '').toLowerCase();
  if (text.includes('increase') || text.includes('expansion')) return 22;
  if (text.includes('reduction') || text.includes('cut'))      return 8;
  return 15;
}

function scoreResearchPipeline(researchData) {
  const completedTrials = researchData?.completedTrials || 0;
  const recentPubs      = researchData?.recentPublications || 0;
  return Math.min(25, (completedTrials * 5) + (recentPubs * 2));
}

async function getPipelineResearchSignal({ keyword }) {
  const [trials, pubs] = await Promise.allSettled([
    getRecentlyCompletedFederalHealthTrials({ daysSince: 180 }),
    searchPubMed({ query: keyword, maxResults: 10 })
  ]);
  return {
    completedTrials: (trials.value || []).filter(t =>
      JSON.stringify(t).toLowerCase().includes(keyword.toLowerCase())
    ).length,
    recentPublications: pubs.value?.esearchresult?.count || 0
  };
}

function buildNarrative(scores, tier) {
  const lines = [];
  if (scores.incumbentVulnerability >= 18) lines.push('Incumbent has been on contract 4+ years — recompete vulnerability is high.');
  if (scores.marketTiming >= 20) lines.push('Contract window is in the 12–24 month sweet spot for capture positioning.');
  if (scores.marketTiming <= 8) lines.push('WARNING: Contract expiration is within 6 months — late entry reduces win probability.');
  if (scores.agencySpendHealth >= 20) lines.push('Budget indicators show program growth — favorable procurement environment.');
  if (scores.agencySpendHealth <= 10) lines.push('WARNING: Budget signals suggest program contraction — higher competitive risk.');
  if (scores.researchPipeline >= 18) lines.push('Active research pipeline signals requirement evolution — opportunity to influence SOW language.');
  return lines.join(' ');
}

module.exports = { scorePursuit };
```

---

### 3.4 `lib/signal-engine.js` — Signal Chain Intelligence (MarketPulse Enterprise)

**Pricing:** $199–$499/month

```javascript
const { getRecentlyCompletedFederalHealthTrials } = require('./clinicaltrials-api');
const { searchBills, getCRSReports } = require('./congress-api');
const { getBudgetDocuments } = require('./govinfo-api');
const { getHiringSurgeData, TARGET_AGENCIES } = require('./usajobs-api');
const { searchContractAwards } = require('./sam-contract-awards');

const SIGNAL_WEIGHTS = {
  TRIAL_COMPLETED:      5,
  PUBLICATION_SURGE:    3,
  BILL_MARKUP:          4,
  NDAA_LANGUAGE_CHANGE: 5,
  CRS_REPORT_PUBLISHED: 3,
  BUDGET_INCREASE:      4,
  HIRING_SURGE:         4,
  CONTRACT_EXPIRING:    5,
  PROTEST_FILED:        3,
};

const CAPTURE_ALERT_THRESHOLD = 14;

/**
 * MAIN ENTRY POINT — Run full 5-layer signal scan for a tracked program
 * Recommended: run daily via cron
 */
async function runSignalScan({ programConfig }) {
  const { programId, programName, keywords, agencyCode, naicsCode, contractExpiryDate } = programConfig;

  const [layer1, layer2, layer3, layer4, layer5] = await Promise.allSettled([
    scanResearchSignals({ keywords }),
    scanLegislativeSignals({ keywords }),
    scanWorkforceSignals({ agencyCode, keywords }),
    scanBudgetSignals({ keywords }),
    scanContractHorizon({ naicsCode, contractExpiryDate })
  ]);

  const firedSignals = [
    ...(layer1.value?.signals || []),
    ...(layer2.value?.signals || []),
    ...(layer3.value?.signals || []),
    ...(layer4.value?.signals || []),
    ...(layer5.value?.signals || [])
  ];

  const totalWeight = firedSignals.reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s.type] || 0), 0);
  const alertLevel = totalWeight >= CAPTURE_ALERT_THRESHOLD ? 'CAPTURE_ALERT'
                   : totalWeight >= 8                       ? 'ELEVATED'
                   : 'MONITOR';

  return {
    programId, programName,
    scanDate: new Date().toISOString(),
    alertLevel, totalSignalWeight: totalWeight,
    signals: firedSignals,
    layers: {
      research: layer1.value, legislative: layer2.value,
      workforce: layer3.value, budget: layer4.value, contract: layer5.value
    },
    captureAlertTriggered: alertLevel === 'CAPTURE_ALERT'
  };
}

// --- Layer 1: Research ---
async function scanResearchSignals({ keywords }) {
  const signals = [];
  const completedTrials = await getRecentlyCompletedFederalHealthTrials({ daysSince: 90 });
  const relevant = completedTrials.filter(t =>
    keywords.some(kw => JSON.stringify(t).toLowerCase().includes(kw.toLowerCase()))
  );
  if (relevant.length > 0) {
    signals.push({
      type: 'TRIAL_COMPLETED',
      description: `${relevant.length} related clinical trial(s) completed in last 90 days`,
      data: relevant.slice(0, 5).map(t => ({
        nctId: t.protocolSection?.identificationModule?.nctId,
        title: t.protocolSection?.identificationModule?.briefTitle,
        completionDate: t.protocolSection?.statusModule?.completionDateStruct?.date,
        sponsor: t.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name
      })),
      recommendedAction: 'Monitor for follow-on procurement within 12–18 months'
    });
  }
  return { signals, trialsScanned: completedTrials.length };
}

// --- Layer 2: Legislative ---
async function scanLegislativeSignals({ keywords }) {
  const signals = [];
  const bills = await searchBills({ query: keywords.join(' OR ') });
  const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const recent = (bills.bills || []).filter(b => new Date(b.latestAction?.actionDate) > cutoff);
  if (recent.length) {
    signals.push({
      type: 'BILL_MARKUP',
      description: `${recent.length} bill(s) with recent legislative action mentioning program keywords`,
      data: recent.map(b => ({ billNumber: b.number, title: b.title, latestAction: b.latestAction })),
      recommendedAction: 'Review bill language for requirement definition changes'
    });
  }
  return { signals };
}

// --- Layer 3: Workforce ---
async function scanWorkforceSignals({ agencyCode, keywords }) {
  const signals = [];
  const recentJobs = await getHiringSurgeData({ agencyCode, keywords: keywords.join(' '), daysSince: 30 });
  if (recentJobs.length >= 10) {
    signals.push({
      type: 'HIRING_SURGE',
      description: `${recentJobs.length} related positions posted at agency in last 30 days`,
      data: recentJobs.slice(0, 5).map(j => ({
        title: j.MatchedObjectDescriptor?.PositionTitle,
        grade: j.MatchedObjectDescriptor?.JobGrade?.[0]?.Code,
        location: j.MatchedObjectDescriptor?.PositionLocationDisplay
      })),
      recommendedAction: 'Hiring surge indicates program ramp-up — begin capture positioning'
    });
  }
  return { signals, jobsFound: recentJobs.length };
}

// --- Layer 4: Budget ---
async function scanBudgetSignals({ keywords }) {
  const signals = [];
  const budgetDocs = await getBudgetDocuments({ keyword: keywords[0], fiscalYear: 'FY2027' });
  const text = JSON.stringify(budgetDocs || '').toLowerCase();
  if (text.includes('increase') || text.includes('expansion') || text.includes('new investment')) {
    signals.push({
      type: 'BUDGET_INCREASE',
      description: 'Budget documents indicate program funding increase for FY2027',
      recommendedAction: 'Funding growth signals procurement expansion — prioritize pursuit'
    });
  }
  return { signals };
}

// --- Layer 5: Contract Horizon ---
async function scanContractHorizon({ contractExpiryDate }) {
  const signals = [];
  if (contractExpiryDate) {
    const months = (new Date(contractExpiryDate) - Date.now()) / (30 * 24 * 3600 * 1000);
    if (months <= 12 && months > 0) {
      signals.push({
        type: 'CONTRACT_EXPIRING',
        description: `Contract expires in ${Math.round(months)} months — recompete planning window open`,
        expiryDate: contractExpiryDate,
        recommendedAction: months <= 6
          ? 'URGENT: <6 months to expiry — draft RFP likely imminent'
          : 'Begin formal capture planning — BD contact with program office now'
      });
    }
  }
  return { signals };
}

module.exports = { runSignalScan, SIGNAL_WEIGHTS, CAPTURE_ALERT_THRESHOLD };
```

---

## 4. API Routes

### 4.1 `api/routes/compliance-check.js`

```javascript
// POST /api/compliance-check
// Auth: requirePaywall('professional')
// Body: { proposalText: string }

router.post('/api/compliance-check', requirePaywall('professional'), async (req, res) => {
  const { proposalText } = req.body;
  if (!proposalText || proposalText.length < 500)
    return res.status(400).json({ error: 'Proposal text required (minimum 500 characters)' });

  const { extractProposalElements } = require('../services/nlp-extractor');
  const { runComplianceCheck } = require('../lib/compliance-checker');

  try {
    const elements = await extractProposalElements(proposalText);
    const report   = await runComplianceCheck({ extractedElements: elements, proposalText });
    await db.complianceReports.create({ userId: req.user.id, report, elements });
    return res.json({ success: true, report, elements });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

### 4.2 `api/routes/pursuit-score.js`

```javascript
// POST /api/pursuit-score
// Auth: requirePaywall('pursuit-engine')
// Body: { keyword, agencyId?, naicsCode? }

router.post('/api/pursuit-score', requirePaywall('pursuit-engine'), async (req, res) => {
  const { keyword, agencyId, naicsCode } = req.body;
  const { scorePursuit } = require('../lib/pursuit-score-engine');
  const cacheKey = `pursuit:${keyword}:${agencyId}:${naicsCode}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const scoreCard = await scorePursuit({ keyword, agencyId, naicsCode });
    await cache.set(cacheKey, scoreCard, 3600);
    return res.json(scoreCard);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

### 4.3 `api/routes/signal-chain.js`

```javascript
// POST /api/programs/track  — add program to monitoring
// GET  /api/signal-chain/:programId — get latest scan

router.post('/api/programs/track', requirePaywall('signal-chain'), async (req, res) => {
  const { programName, keywords, agencyCode, naicsCode, contractExpiryDate } = req.body;
  const program = await db.trackedPrograms.create({
    userId: req.user.id, programName, keywords, agencyCode, naicsCode, contractExpiryDate,
    createdAt: new Date()
  });
  return res.json({ success: true, programId: program.id });
});

router.get('/api/signal-chain/:programId', requirePaywall('signal-chain'), async (req, res) => {
  const { runSignalScan } = require('../lib/signal-engine');
  const program = await db.trackedPrograms.findById(req.params.programId);
  if (!program || program.userId !== req.user.id)
    return res.status(404).json({ error: 'Not found' });

  const recent = await db.signalEvents.findLatest({ programId: program.id, withinHours: 6 });
  if (recent) return res.json(recent);

  const scan = await runSignalScan({ programConfig: program });
  await db.signalEvents.create({ programId: program.id, scan });

  if (scan.captureAlertTriggered) {
    await emailService.sendCaptureAlert({
      userId: program.userId, programName: program.programName, scan
    });
  }
  return res.json(scan);
});
```

---

## 5. Paywall Tier Definitions

```javascript
// services/paywall.js — extend existing structure

const TIERS = {
  free:           { proposalChecks: 1,        marketBriefs: 1,        pursuitScores: 0,        signalPrograms: 0  },
  starter:        { proposalChecks: Infinity,  marketBriefs: 0,        pursuitScores: 0,        signalPrograms: 0  },
  professional:   { proposalChecks: Infinity,  marketBriefs: 0,        pursuitScores: 0,        signalPrograms: 0,  complianceCheck: true },
  pursuit_engine: { proposalChecks: Infinity,  marketBriefs: 5,        pursuitScores: Infinity, signalPrograms: 0  },
  signal_chain:   { proposalChecks: Infinity,  marketBriefs: Infinity, pursuitScores: Infinity, signalPrograms: 15 },
  team:           { proposalChecks: Infinity,  marketBriefs: Infinity, pursuitScores: Infinity, signalPrograms: 15, seats: 5 }
};

const PRICING = {
  starter:        { perUnit: 1999,  unit: 'assessment',  stripeProductId: 'prod_starter'      },
  professional:   { perUnit: 4999,  unit: 'assessment',  monthly: 29900,  stripeProductId: 'prod_professional' },
  pursuit_engine: { monthly: 9900,  stripeProductId: 'prod_pursuit'      },
  signal_chain:   { monthly: 19900, stripeProductId: 'prod_signal'       },
  team:           { monthly: 99900, stripeProductId: 'prod_team'         }
};
```

---

## 6. Environment Variables

```bash
# SAM.gov — CRITICAL: start system account application now (2-4 weeks approval)
SAM_SYSTEM_ACCOUNT_API_KEY=    # System Account key — for contract awards (NOT personal key)
SAM_PUBLIC_API_KEY=            # Personal key — for wage determinations, entity, opportunities

# api.data.gov — one key covers both Congress.gov and GovInfo.gov
CONGRESS_API_KEY=              # Register: https://api.data.gov/signup/

# NCBI/PubMed — optional but strongly recommended for rate limits
NCBI_API_KEY=                  # Register: https://www.ncbi.nlm.nih.gov/account/

# USAJobs — required
USAJOBS_API_KEY=               # Register: https://developer.usajobs.gov/APIRequest/Index
USAJOBS_HOST=missionmeetstech.com

# BLS — optional but recommended
BLS_API_KEY=                   # Register: https://data.bls.gov/registrationEngine/

# Existing (already have)
OPENAI_API_KEY=                # or ANTHROPIC_API_KEY — for NLP extractor
STRIPE_SECRET_KEY=
DATABASE_URL=
REDIS_URL=                     # strongly recommended for API response caching
```

---

## 7. Caching Strategy (TTL in seconds)

```javascript
const TTL = {
  samContractAwards:    3600,    // 1 hr
  samOpportunities:     1800,    // 30 min
  congressBills:        3600,    // 1 hr
  govinfoBudget:        86400,   // 24 hr — budget docs don't change intraday
  pubmedSearch:         43200,   // 12 hr
  clinicalTrials:       21600,   // 6 hr
  usajobsSearch:        3600,    // 1 hr
  chplCertification:    86400,   // 24 hr
  wageDeterminations:   604800,  // 7 days
  blsWages:             2592000, // 30 days — OEWS is annual data
  edgarFinancials:      86400,   // 24 hr
  itDashboard:          43200,   // 12 hr
  cmsProviderData:      86400,   // 24 hr
  pursuitScore:         3600,    // 1 hr per pursuit score card
  signalScan:           21600,   // 6 hr per program scan
};
```

---

## 8. Scheduled Jobs (Cron)

```
Daily  06:00 ET  Run signal scans for all active tracked programs
Daily  07:00 ET  Send capture alert digest emails (overnight signals)
Daily  08:00 ET  Check SAM.gov for new opportunities matching tracked NAICS/keywords
Weekly Mon 07:00 Refresh BLS wage data cache
Weekly Mon 07:30 Refresh CMS provider quality data cache
Weekly Mon 08:00 Refresh EDGAR contractor financial data
Monthly 1st      Refresh WD wage determinations cache
```

---

## 9. 110% A++ Features — What Takes This Beyond Any Competitor

**1. "Why This Matters" Editorial Context Layer**
Every signal fired — completed clinical trial, hiring surge, budget change — should surface MMT editorial context explaining why it matters for federal health IT specifically. A competitor can copy the API calls. Nobody can copy the institutional knowledge baked into the interpretation layer. This is the moat.

**2. COMP/PSCP Account Tracker (FY2027-Specific)**
A dedicated live dashboard tracking the DHA COMP/PSCP account separation: J-book publication dates, program element narrative changes, hearing testimony, markup amendments. Updated the moment GovInfo publishes new documents. Your existing newsletter subscribers check this daily. Converts readers to paying users at maximum engagement.

**3. Pursuit Score History + Win Rate Correlation**
Track pursuit scores over time against actual awards. When a user monitors a program for 12 months and an award is announced, correlate the final score with the outcome. Over time this trains the model on your audience's specific win/loss patterns — a proprietary dataset no competitor can acquire.

**4. Newsletter → Tool Conversion Links**
Every newsletter reference to a DHA program, VA contract, or HHS regulation deep-links directly to the Pursuit Score card or Signal Chain dashboard for that program. A reader of the April 13 USUHS analysis issue is one click from the Pursuit Score card for the DHA GENESIS IDIQ. Converts newsletter readers at the moment of maximum engagement.

**5. Team Collaboration Workspace (Enterprise Tier)**
Multiple users annotate signal events, add BD notes, and share pursuit score cards within a shared workspace. BD directors assign programs to capture managers, who add notes that persist alongside signal data. Organizational data stored in the tool makes cancellation painful. This is the enterprise retention mechanic.
