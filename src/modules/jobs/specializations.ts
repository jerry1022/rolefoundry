/** Detailed career directions from the original playbook, independent of assessment tracks. */
export const careerPathIds = [
  "ai-llm-applications",
  "machine-learning",
  "data-analytics-science",
  "data-engineering",
  "mlops-platform",
  "computer-vision-edge",
  "ai-product-consulting",
  "ai-automation-operations",
  "ai-research",
  "ai-design-content",
] as const;
export type CareerPathId = (typeof careerPathIds)[number];
export interface CareerPath {
  id: CareerPathId;
  title: string;
  aliases: string[];
  work: string;
  learning: string[];
  evidence: string[];
  project: string;
}
export const careerPaths: CareerPath[] = [
  {
    id: "ai-llm-applications",
    title: "AI / LLM application engineering",
    aliases: [
      "AI engineer",
      "LLM engineer",
      "RAG",
      "AI application",
      "AI 工程師",
      "LLM 應用工程師",
    ],
    work: "Build document assistants, knowledge search, tool integrations and dependable AI applications.",
    learning: [
      "Python, Git, HTTP and SQL",
      "Backend APIs and LLM integration",
      "Retrieval, tool calling and structured outputs",
      "Evaluation, deployment, latency and cost",
    ],
    evidence: [
      "A working service with repeatable tests and source attribution.",
      "Measured quality, failure cases, response time and operating cost.",
    ],
    project:
      "Build a domain document assistant with cited answers, a held-out question set and explicit refusal behavior.",
  },
  {
    id: "machine-learning",
    title: "Machine learning engineering",
    aliases: ["ML engineer", "機器學習工程師", "模型工程師"],
    work: "Develop classification, prediction, recommendation and anomaly-detection systems.",
    learning: [
      "Python, SQL, statistics and linear algebra",
      "Baseline models with scikit-learn",
      "Data validation, leakage prevention and error analysis",
      "Deep learning where needed, then model serving",
    ],
    evidence: [
      "A justified baseline and correct train/validation/test splits.",
      "Reproducible experiments and performance analysis across meaningful segments.",
    ],
    project:
      "Compare a baseline with a churn or demand-prediction model and explain errors on held-out data.",
  },
  {
    id: "data-analytics-science",
    title: "Data analytics & data science",
    aliases: [
      "Data analyst",
      "Data scientist",
      "Growth analyst",
      "資料分析師",
      "資料科學家",
      "數據分析",
    ],
    work: "Turn data into business insight, experiments, decision support and appropriate predictive models.",
    learning: [
      "SQL and statistical foundations",
      "Python or BI tools and clear metric definitions",
      "Business questions, visualization and inference limits",
      "Experiment design, A/B testing and relevant ML",
    ],
    evidence: [
      "Reproducible queries and analysis with explicit assumptions.",
      "A decision recommendation supported by data and a credible experiment design.",
    ],
    project:
      "Create a metric dashboard and an experiment proposal, documenting what the data can and cannot establish.",
  },
  {
    id: "data-engineering",
    title: "Data engineering",
    aliases: ["Data engineer", "ETL", "ELT", "資料工程師", "資料管線"],
    work: "Build data ingestion, transformation, storage and quality foundations for analytics and AI teams.",
    learning: [
      "SQL and Python",
      "Data modeling and storage design",
      "ETL / ELT, orchestration and scheduling",
      "Quality tests, cloud operations and failure recovery",
    ],
    evidence: [
      "A rerunnable pipeline with documented data contracts and quality checks.",
      "Recovery behavior for late, duplicate, malformed or missing inputs.",
    ],
    project:
      "Build a multi-source data pipeline with scheduled updates, quality checks and a safe replay procedure.",
  },
  {
    id: "mlops-platform",
    title: "MLOps & AI platform engineering",
    aliases: ["MLOps", "AI platform", "ML platform", "DevOps", "AI 平台工程師", "模型部署"],
    work: "Make model services reproducible, deployable, observable and recoverable.",
    learning: [
      "Linux and Python",
      "Docker, cloud infrastructure and CI/CD",
      "Model serving, versioning and monitoring",
      "Rollback, reliability and orchestration when required",
    ],
    evidence: [
      "Automated delivery with versioned artifacts and repeatable deployment.",
      "Service metrics, failure diagnosis and a demonstrated rollback.",
    ],
    project:
      "Deploy a versioned model service with health checks, monitoring and a tested release rollback.",
  },
  {
    id: "computer-vision-edge",
    title: "Computer vision & Edge AI",
    aliases: ["Computer vision", "Edge AI", "Vision engineer", "電腦視覺", "邊緣 AI", "視覺檢測"],
    work: "Build detection, recognition and segmentation applications, including device-side inference.",
    learning: [
      "Python and image processing",
      "Deep learning and image datasets",
      "Detection / segmentation, labeling and evaluation",
      "Inference optimization and device constraints",
    ],
    evidence: [
      "False-positive and false-negative analysis under realistic scene variation.",
      "Measured inference speed, resource use and documented dataset limitations.",
    ],
    project:
      "Create a small visual inspection service and compare errors and inference performance across conditions.",
  },
  {
    id: "ai-product-consulting",
    title: "AI product & implementation consulting",
    aliases: [
      "AI PM",
      "Product manager",
      "AI consultant",
      "Solutions consultant",
      "AI 產品經理",
      "AI 導入顧問",
    ],
    work: "Discover valuable AI opportunities, define products and guide adoption with measurable outcomes.",
    learning: [
      "User interviews and workflow analysis",
      "AI capabilities, constraints and alternatives",
      "Prototyping, evaluation and cost estimation",
      "Delivery planning, adoption and outcome measurement",
    ],
    evidence: [
      "Clear requirements, research findings and a justified choice of approach.",
      "A prototype with success metrics, risks, costs and a practical rollout plan.",
    ],
    project:
      "Produce an industry-specific AI prototype and adoption proposal grounded in a real workflow problem.",
  },
  {
    id: "ai-automation-operations",
    title: "AI automation & operations",
    aliases: ["AI automation", "Workflow specialist", "n8n", "流程自動化", "AI 營運", "自動化工程"],
    work: "Improve document, reporting, support and administrative workflows using AI and automation.",
    learning: [
      "Process decomposition and data preparation",
      "Automation tools and integration patterns",
      "APIs, webhooks and Python where useful",
      "Exceptions, human approvals and process measurement",
    ],
    evidence: [
      "A measured before/after process baseline, including errors and time.",
      "Explicit human intervention, failure recovery and approval boundaries.",
    ],
    project:
      "Build a document extraction and review workflow with an approval step and a tested fallback.",
  },
  {
    id: "ai-research",
    title: "AI research & research engineering",
    aliases: [
      "AI researcher",
      "Research engineer",
      "Research scientist",
      "AI 研究員",
      "研究工程師",
    ],
    work: "Investigate methods, reproduce papers and design rigorous model-training experiments.",
    learning: [
      "Linear algebra, probability and optimization",
      "Deep learning and experimental methodology",
      "Paper reading and reproducible implementation",
      "Training, ablations and research communication",
    ],
    evidence: [
      "A reproducible experiment or paper reproduction with explicit assumptions.",
      "Baselines, controlled comparisons and honest limitations or negative results.",
    ],
    project:
      "Reproduce a bounded published result, then run a clearly motivated ablation and document the outcome.",
  },
  {
    id: "ai-design-content",
    title: "AI design & content",
    aliases: ["Content designer", "Generative designer", "AI 設計", "生成式內容", "AI 影音"],
    work: "Combine creative judgment and AI workflows to produce usable, audience-appropriate design and content.",
    learning: [
      "Audience, briefs and creative constraints",
      "Generation tools and reusable prompting workflows",
      "Iteration, accessibility and factual review",
      "Portfolio presentation and documented contribution",
    ],
    evidence: [
      "A consistent brief, review criteria and an explained iteration history.",
      "A portfolio that identifies personal contribution, source rights and limitations.",
    ],
    project:
      "Create a small content or design series with a documented brief, review checklist and iteration record.",
  },
];
export function getCareerPath(id: CareerPathId) {
  return careerPaths.find((path) => path.id === id)!;
}
