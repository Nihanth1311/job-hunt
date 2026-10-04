import "server-only";
// The companies whose own careers sites we read. Every entry was checked to return jobs in
// India with the company's own posting date. `key` depends on the platform:
//   workday          "tenant|wdN|Site"   from https://tenant.wdN.myworkdayjobs.com/Site
//   oracle           "host|SiteNumber"   Oracle Recruiting Cloud (…oraclecloud.com)
//   eightfold        "host|domain"       Eightfold careers sites
//   smartrecruiters  company id          jobs.smartrecruiters.com/<id>
//   greenhouse/lever/ashby  board slug   e.g. jobs.lever.co/<slug>
//   amazon/google    ""                  their own sites

export type Platform = "workday" | "amazon" | "google" | "oracle" | "eightfold" | "smartrecruiters" | "greenhouse" | "lever" | "ashby";

export const SECTORS = [
  "Big Tech",
  "Software & Cloud",
  "Chips & Hardware",
  "Banks & Finance",
  "Payments & Fintech",
  "Indian product companies",
  "Travel, Retail & Media",
  "Consulting",
  "Industry & Healthcare",
] as const;
export type Sector = (typeof SECTORS)[number];

export interface Company {
  id: string;
  name: string;
  sector: Sector;
  platform: Platform;
  key: string;
}

const c = (id: string, name: string, sector: Sector, platform: Platform, key = ""): Company => ({ id, name, sector, platform, key });

export const COMPANIES: Company[] = [
  // Big Tech
  c("google", "Google", "Big Tech", "google"),
  c("amazon", "Amazon", "Big Tech", "amazon"),
  c("microsoft", "Microsoft", "Big Tech", "eightfold", "apply.careers.microsoft.com|microsoft.com"),
  c("oracle", "Oracle", "Big Tech", "oracle", "eeho.fa.us2.oraclecloud.com|CX_45001"),
  c("salesforce", "Salesforce", "Big Tech", "workday", "salesforce|wd12|External_Career_Site"),
  c("adobe", "Adobe", "Big Tech", "workday", "adobe|wd5|external_experienced"),
  c("nvidia", "NVIDIA", "Big Tech", "workday", "nvidia|wd5|NVIDIAExternalCareerSite"),
  c("openai", "OpenAI", "Big Tech", "ashby", "openai"),

  // Software & Cloud
  c("servicenow", "ServiceNow", "Software & Cloud", "smartrecruiters", "ServiceNow"),
  c("workday", "Workday", "Software & Cloud", "workday", "workday|wd5|Workday"),
  c("autodesk", "Autodesk", "Software & Cloud", "workday", "autodesk|wd1|Ext"),
  c("paloalto", "Palo Alto Networks", "Software & Cloud", "workday", "paloaltonetworks|wd5|panwexternalcareers"),
  c("databricks", "Databricks", "Software & Cloud", "greenhouse", "databricks"),
  c("snowflake", "Snowflake", "Software & Cloud", "ashby", "snowflake"),
  c("mongodb", "MongoDB", "Software & Cloud", "greenhouse", "mongodb"),
  c("okta", "Okta", "Software & Cloud", "greenhouse", "okta"),
  c("zscaler", "Zscaler", "Software & Cloud", "greenhouse", "zscaler"),
  c("purestorage", "Pure Storage", "Software & Cloud", "greenhouse", "purestorage"),
  c("rubrik", "Rubrik", "Software & Cloud", "greenhouse", "rubrik"),
  c("gitlab", "GitLab", "Software & Cloud", "greenhouse", "gitlab"),
  c("elastic", "Elastic", "Software & Cloud", "greenhouse", "elastic"),
  c("datadog", "Datadog", "Software & Cloud", "greenhouse", "datadog"),
  c("newrelic", "New Relic", "Software & Cloud", "greenhouse", "newrelic"),
  c("twilio", "Twilio", "Software & Cloud", "greenhouse", "twilio"),
  c("druva", "Druva", "Software & Cloud", "greenhouse", "druva"),
  c("highradius", "HighRadius", "Software & Cloud", "greenhouse", "highradius"),
  c("toast", "Toast", "Software & Cloud", "greenhouse", "toast"),
  c("samsara", "Samsara", "Software & Cloud", "greenhouse", "samsara"),
  c("notion", "Notion", "Software & Cloud", "ashby", "notion"),
  c("cursor", "Cursor", "Software & Cloud", "ashby", "cursor"),
  c("atlan", "Atlan", "Software & Cloud", "ashby", "atlan"),
  c("freshworks", "Freshworks", "Software & Cloud", "smartrecruiters", "Freshworks"),

  // Chips & Hardware
  c("qualcomm", "Qualcomm", "Chips & Hardware", "eightfold", "careers.qualcomm.com|qualcomm.com"),
  c("intel", "Intel", "Chips & Hardware", "workday", "intel|wd1|External"),
  c("micron", "Micron", "Chips & Hardware", "workday", "micron|wd1|External"),
  c("broadcom", "Broadcom", "Chips & Hardware", "workday", "broadcom|wd1|External_Career"),
  c("amat", "Applied Materials", "Chips & Hardware", "workday", "amat|wd1|External"),
  c("kla", "KLA", "Chips & Hardware", "workday", "kla|wd1|Search"),
  c("hp", "HP", "Chips & Hardware", "workday", "hp|wd5|ExternalCareerSite"),
  c("hpe", "Hewlett Packard Enterprise", "Chips & Hardware", "workday", "hpe|wd5|ACJobSite"),
  c("bosch", "Bosch", "Chips & Hardware", "smartrecruiters", "BoschGroup"),

  // Banks & Finance
  c("jpmorgan", "JPMorgan Chase", "Banks & Finance", "oracle", "jpmc.fa.oraclecloud.com|CX_1001"),
  c("morganstanley", "Morgan Stanley", "Banks & Finance", "workday", "ms|wd5|External"),
  c("citi", "Citi", "Banks & Finance", "workday", "citi|wd5|2"),
  c("bofa", "Bank of America", "Banks & Finance", "workday", "ghr|wd1|Lateral-US"),
  c("wellsfargo", "Wells Fargo", "Banks & Finance", "workday", "wf|wd1|WellsFargoJobs"),
  c("barclays", "Barclays", "Banks & Finance", "workday", "barclays|wd3|External_Career_Site_Barclays"),
  c("deutschebank", "Deutsche Bank", "Banks & Finance", "workday", "db|wd3|DBWebsite"),
  c("blackrock", "BlackRock", "Banks & Finance", "workday", "blackrock|wd1|BlackRock_Professional"),
  c("statestreet", "State Street", "Banks & Finance", "workday", "statestreet|wd1|Global"),
  c("fidelity", "Fidelity", "Banks & Finance", "workday", "fmr|wd1|FidelityCareers"),
  c("capitalone", "Capital One", "Banks & Finance", "workday", "capitalone|wd12|Capital_One"),
  c("lseg", "LSEG", "Banks & Finance", "workday", "lseg|wd3|Careers"),

  // Payments & Fintech
  c("visa", "Visa", "Payments & Fintech", "workday", "visa|wd5|Visa"),
  c("mastercard", "Mastercard", "Payments & Fintech", "workday", "mastercard|wd1|CorporateCareers"),
  c("paypal", "PayPal", "Payments & Fintech", "workday", "paypal|wd1|jobs"),
  c("stripe", "Stripe", "Payments & Fintech", "greenhouse", "stripe"),
  c("coinbase", "Coinbase", "Payments & Fintech", "greenhouse", "coinbase"),
  c("razorpay", "Razorpay", "Payments & Fintech", "greenhouse", "razorpaysoftwareprivatelimited"),
  c("paytm", "Paytm", "Payments & Fintech", "lever", "paytm"),
  c("zeta", "Zeta", "Payments & Fintech", "lever", "zeta"),
  c("cred", "CRED", "Payments & Fintech", "lever", "cred"),
  c("groww", "Groww", "Payments & Fintech", "greenhouse", "groww"),
  c("fampay", "FamPay", "Payments & Fintech", "lever", "fampay"),
  c("bureau", "Bureau", "Payments & Fintech", "ashby", "bureau"),

  // Indian product companies
  c("meesho", "Meesho", "Indian product companies", "lever", "meesho"),
  c("inmobi", "InMobi", "Indian product companies", "greenhouse", "inmobi"),
  c("hackerrank", "HackerRank", "Indian product companies", "greenhouse", "hackerrank"),
  c("hevodata", "Hevo Data", "Indian product companies", "lever", "hevodata"),
  c("mindtickle", "Mindtickle", "Indian product companies", "lever", "mindtickle"),
  c("sarvam", "Sarvam AI", "Indian product companies", "ashby", "sarvam"),
  c("plane", "Plane", "Indian product companies", "ashby", "plane"),
  c("sigmoid", "Sigmoid", "Indian product companies", "greenhouse", "sigmoid"),

  // Travel, Retail & Media
  c("expedia", "Expedia", "Travel, Retail & Media", "workday", "expedia|wd108|search"),
  c("ebay", "eBay", "Travel, Retail & Media", "workday", "ebay|wd5|apply"),
  c("target", "Target", "Travel, Retail & Media", "workday", "target|wd5|targetcareers"),
  c("airbnb", "Airbnb", "Travel, Retail & Media", "greenhouse", "airbnb"),
  c("agoda", "Agoda", "Travel, Retail & Media", "greenhouse", "agoda"),
  c("sabre", "Sabre", "Travel, Retail & Media", "workday", "sabre|wd1|SabreJobs"),
  c("disney", "Disney", "Travel, Retail & Media", "workday", "disney|wd5|disneycareer"),
  c("warnerbros", "Warner Bros. Discovery", "Travel, Retail & Media", "workday", "warnerbros|wd5|global"),
  c("thomsonreuters", "Thomson Reuters", "Travel, Retail & Media", "workday", "thomsonreuters|wd5|External_Career_Site"),

  // Consulting
  c("accenture", "Accenture", "Consulting", "workday", "accenture|wd103|AccentureCareers"),
  c("pwc", "PwC", "Consulting", "workday", "pwc|wd3|Global_Experienced_Careers"),
  c("gartner", "Gartner", "Consulting", "workday", "gartner|wd5|EXT"),

  // Industry & Healthcare
  c("philips", "Philips", "Industry & Healthcare", "workday", "philips|wd3|jobs-and-careers"),
  c("caterpillar", "Caterpillar", "Industry & Healthcare", "workday", "cat|wd5|CaterpillarCareers"),
  c("boeing", "Boeing", "Industry & Healthcare", "workday", "boeing|wd1|EXTERNAL_CAREERS"),
  c("shell", "Shell", "Industry & Healthcare", "workday", "shell|wd3|ShellCareers"),
  c("maersk", "Maersk", "Industry & Healthcare", "workday", "maersk|wd3|Maersk_Careers"),
  c("novartis", "Novartis", "Industry & Healthcare", "workday", "novartis|wd3|Novartis_Careers"),
  c("astrazeneca", "AstraZeneca", "Industry & Healthcare", "workday", "astrazeneca|wd3|Careers"),
  c("gsk", "GSK", "Industry & Healthcare", "workday", "gsk|wd5|GSKCareers"),
  c("pfizer", "Pfizer", "Industry & Healthcare", "workday", "pfizer|wd1|PfizerCareers"),
];

export const COMPANY_BY_ID = new Map(COMPANIES.map((co) => [co.id, co]));

/** "greenhouse:stripe"-style keys of boards the registry covers, so custom career-page lines don't fetch them twice. */
export const REGISTRY_BOARDS = new Set(
  COMPANIES.filter((co) => ["greenhouse", "lever", "ashby"].includes(co.platform)).map((co) => `${co.platform}:${co.key}`.toLowerCase()),
);
