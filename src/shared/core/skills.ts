import type { SkillGroup } from "../types";

interface SkillDef {
  name: string;
  group: SkillGroup;
  aliases: string[];
}

// Canonical skill names, the group they count towards, and how JDs spell them.
const DEFS: SkillDef[] = [
  // Frontend
  { name: "React", group: "frontend", aliases: ["react", "react.js", "reactjs"] },
  { name: "Next.js", group: "frontend", aliases: ["next.js", "nextjs"] },
  { name: "Angular", group: "frontend", aliases: ["angular", "angularjs"] },
  { name: "Vue", group: "frontend", aliases: ["vue", "vue.js", "vuejs", "nuxt"] },
  { name: "JavaScript", group: "frontend", aliases: ["javascript", "es6", "ecmascript"] },
  { name: "TypeScript", group: "frontend", aliases: ["typescript"] },
  { name: "HTML", group: "frontend", aliases: ["html", "html5"] },
  { name: "CSS", group: "frontend", aliases: ["css", "css3", "scss", "sass"] },
  { name: "Tailwind", group: "frontend", aliases: ["tailwind", "tailwindcss"] },
  { name: "Redux", group: "frontend", aliases: ["redux", "redux toolkit", "zustand"] },
  { name: "Webpack/Vite", group: "frontend", aliases: ["webpack", "vite"] },
  { name: "React Native", group: "frontend", aliases: ["react native"] },
  { name: "iOS / Swift", group: "other", aliases: ["ios", "swift", "swiftui", "objective-c", "xcode"] },
  { name: "Android / Kotlin", group: "other", aliases: ["android", "kotlin", "jetpack compose"] },
  { name: "Flutter", group: "other", aliases: ["flutter", "dart"] },
  { name: "Jest", group: "frontend", aliases: ["jest", "react testing library", "vitest", "cypress", "playwright"] },

  // Backend
  { name: "Node.js", group: "backend", aliases: ["node", "node.js", "nodejs"] },
  { name: "Express", group: "backend", aliases: ["express.js", "expressjs", "express js"] },
  { name: "NestJS", group: "backend", aliases: ["nestjs", "nest.js"] },
  { name: "Python", group: "backend", aliases: ["python"] },
  { name: "Django", group: "backend", aliases: ["django"] },
  { name: "FastAPI", group: "backend", aliases: ["fastapi", "flask"] },
  { name: "Java", group: "backend", aliases: ["java"] },
  { name: "Spring Boot", group: "backend", aliases: ["spring boot", "springboot", "spring"] },
  { name: "Go", group: "backend", aliases: ["golang"] },
  { name: ".NET", group: "backend", aliases: [".net", "c#", "asp.net", "dotnet"] },
  { name: "PHP", group: "backend", aliases: ["php", "laravel"] },
  { name: "REST APIs", group: "backend", aliases: ["restful", "rest api", "rest apis", "rest services", "api development"] },
  { name: "GraphQL", group: "backend", aliases: ["graphql"] },
  { name: "Microservices", group: "backend", aliases: ["microservices", "microservice"] },
  { name: "SQL", group: "backend", aliases: ["sql", "rdbms"] },
  { name: "PostgreSQL", group: "backend", aliases: ["postgres", "postgresql"] },
  { name: "MySQL", group: "backend", aliases: ["mysql"] },
  { name: "MongoDB", group: "backend", aliases: ["mongodb", "mongo", "mongoose"] },
  { name: "Redis", group: "backend", aliases: ["redis"] },
  { name: "Kafka", group: "backend", aliases: ["kafka", "rabbitmq", "message queue", "message queues"] },

  // DevOps
  { name: "Docker", group: "devops", aliases: ["docker", "containers", "containerization"] },
  { name: "Kubernetes", group: "devops", aliases: ["kubernetes", "k8s", "eks", "aks", "gke"] },
  { name: "CI/CD", group: "devops", aliases: ["ci/cd", "ci cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { name: "Jenkins", group: "devops", aliases: ["jenkins"] },
  { name: "GitHub Actions", group: "devops", aliases: ["github actions", "gitlab ci", "azure devops"] },
  { name: "Terraform", group: "devops", aliases: ["terraform", "infrastructure as code", "iac", "pulumi", "cloudformation"] },
  { name: "Ansible", group: "devops", aliases: ["ansible", "chef", "puppet"] },
  { name: "AWS", group: "devops", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  { name: "Azure", group: "devops", aliases: ["azure"] },
  { name: "GCP", group: "devops", aliases: ["gcp", "google cloud"] },
  { name: "Linux", group: "devops", aliases: ["linux", "unix"] },
  { name: "Shell scripting", group: "devops", aliases: ["bash", "shell scripting", "shell script", "powershell"] },
  { name: "Helm", group: "devops", aliases: ["helm"] },
  { name: "Monitoring", group: "devops", aliases: ["prometheus", "grafana", "datadog", "elk", "observability", "new relic"] },
  { name: "Nginx", group: "devops", aliases: ["nginx", "load balancer", "load balancing"] },
  { name: "ArgoCD", group: "devops", aliases: ["argocd", "argo cd", "gitops"] },

  // Data science & ML (Python and SQL already count above)
  { name: "Machine Learning", group: "data", aliases: ["machine learning", "ml models", "predictive model", "predictive modelling", "predictive modeling"] },
  { name: "Deep Learning", group: "data", aliases: ["deep learning", "neural network", "neural networks", "cnn", "rnn", "lstm"] },
  { name: "NLP", group: "data", aliases: ["nlp", "natural language processing"] },
  { name: "Computer Vision", group: "data", aliases: ["computer vision", "opencv", "image processing"] },
  { name: "LLMs", group: "data", aliases: ["llm", "llms", "large language model", "large language models", "generative ai", "genai", "gen ai", "rag", "langchain", "prompt engineering"] },
  { name: "Pandas", group: "data", aliases: ["pandas"] },
  { name: "NumPy", group: "data", aliases: ["numpy", "scipy"] },
  { name: "Scikit-learn", group: "data", aliases: ["scikit-learn", "sklearn", "scikit learn"] },
  { name: "TensorFlow", group: "data", aliases: ["tensorflow", "keras"] },
  { name: "PyTorch", group: "data", aliases: ["pytorch", "torch"] },
  { name: "XGBoost", group: "data", aliases: ["xgboost", "lightgbm", "catboost", "gradient boosting"] },
  { name: "Statistics", group: "data", aliases: ["statistics", "statistical analysis", "statistical modelling", "statistical modeling", "hypothesis testing", "a/b testing", "probability", "regression analysis"] },
  { name: "R", group: "data", aliases: ["r programming", "r language", "rstudio", "r/python", "python/r"] },
  { name: "Spark", group: "data", aliases: ["spark", "pyspark", "apache spark", "databricks"] },
  { name: "Hadoop", group: "data", aliases: ["hadoop", "hive", "hdfs"] },
  { name: "Airflow", group: "data", aliases: ["airflow", "dbt", "etl", "elt", "data pipeline", "data pipelines"] },
  { name: "Data Warehousing", group: "data", aliases: ["snowflake", "bigquery", "redshift", "data warehouse", "data warehousing"] },
  { name: "Tableau / Power BI", group: "data", aliases: ["tableau", "power bi", "powerbi", "looker", "data visualization", "data visualisation"] },
  { name: "Excel", group: "data", aliases: ["advanced excel", "ms excel", "microsoft excel"] },
  { name: "Jupyter", group: "data", aliases: ["jupyter", "jupyter notebook"] },
  { name: "MLOps", group: "data", aliases: ["mlops", "mlflow", "kubeflow", "sagemaker", "vertex ai", "model deployment"] },

  // Cybersecurity
  { name: "Network Security", group: "security", aliases: ["network security", "firewall", "firewalls", "ids/ips", "ids", "ips", "vpn", "tcp/ip"] },
  { name: "Application Security", group: "security", aliases: ["application security", "appsec", "secure coding", "owasp", "owasp top 10", "sast", "dast", "secure code review"] },
  { name: "Penetration Testing", group: "security", aliases: ["penetration testing", "pentesting", "pen testing", "pentest", "ethical hacking", "red team", "burp suite", "metasploit", "kali linux"] },
  { name: "Vulnerability Management", group: "security", aliases: ["vulnerability management", "vulnerability assessment", "vapt", "nessus", "qualys", "vulnerability scanning", "cve"] },
  { name: "SIEM", group: "security", aliases: ["siem", "splunk", "qradar", "sentinel", "arcsight", "log analysis"] },
  { name: "SOC", group: "security", aliases: ["soc", "security operations", "security monitoring", "threat detection", "incident response", "edr", "xdr", "crowdstrike"] },
  { name: "Threat Intelligence", group: "security", aliases: ["threat intelligence", "threat hunting", "threat modeling", "threat modelling", "mitre att&ck", "mitre attack", "malware analysis"] },
  { name: "Identity & Access", group: "security", aliases: ["iam", "identity and access management", "okta", "active directory", "sso", "oauth", "saml", "pam", "zero trust"] },
  { name: "Cloud Security", group: "security", aliases: ["cloud security", "cspm", "aws security", "azure security", "security groups", "kms"] },
  { name: "Cryptography", group: "security", aliases: ["cryptography", "encryption", "pki", "tls", "ssl"] },
  { name: "Security Compliance", group: "security", aliases: ["iso 27001", "soc 2", "soc2", "nist", "pci dss", "pci-dss", "gdpr", "grc", "risk assessment"] },
  { name: "Wireshark", group: "security", aliases: ["wireshark", "nmap", "tcpdump"] },
  { name: "Security Certifications", group: "security", aliases: ["ceh", "oscp", "cissp", "comptia security+", "security+", "cism", "cisa"] },

  // General
  { name: "Git", group: "other", aliases: ["git"] },
  { name: "DSA", group: "other", aliases: ["data structures", "algorithms", "dsa"] },
  { name: "OOP", group: "other", aliases: ["oop", "oops", "object oriented", "object-oriented"] },
  { name: "System Design", group: "other", aliases: ["system design", "low level design", "lld", "hld"] },
  { name: "Agile", group: "other", aliases: ["agile", "scrum", "jira"] },
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const COMPILED = DEFS.map((d) => ({
  ...d,
  re: new RegExp(`(?<![a-z0-9])(?:${d.aliases.map(escapeRe).join("|")})(?![a-z0-9])`, "i"),
}));

const BY_NAME = new Map(COMPILED.map((d) => [d.name.toLowerCase(), d]));

/** All known skills mentioned in a piece of text, as canonical names. */
export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return COMPILED.filter((d) => d.re.test(lower)).map((d) => d.name);
}

export function skillGroup(name: string): SkillGroup {
  return BY_NAME.get(name.toLowerCase())?.group ?? "other";
}

/** Map whatever you typed in your profile ("reactjs", "k8s") to canonical names where we know them. */
export function canonicalize(userSkills: string[]): string[] {
  const out = new Set<string>();
  for (const raw of userSkills) {
    const s = raw.trim();
    if (!s) continue;
    const found = extractSkills(s);
    if (found.length) found.forEach((f) => out.add(f));
    else out.add(s);
  }
  return [...out];
}

export const ALL_SKILL_NAMES = DEFS.map((d) => d.name);
