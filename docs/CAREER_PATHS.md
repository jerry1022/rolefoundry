# AI career classifications

The original career playbook contains **nine detailed career directions**. The first scaffold exposed only the four broad assessment tracks; this made the detailed classification invisible on the website. The job discovery screen now exposes the original directions directly, alongside the existing design/content direction.

## Two distinct classification levels

- **Assessment tracks:** engineering/data, product/strategy, marketing/operations and design/content. These select the foundational assessment, not a complete specialist taxonomy.
- **Job specializations:** the ten directions below. Each opening has one primary specialization. A specialization can occur across more than one broad track; for example, business analytics can belong to marketing/operations.

| Stable ID | Direction | Original playbook |
| --- | --- | --- |
| `ai-llm-applications` | AI / LLM application engineering | Original direction 1 |
| `machine-learning` | Machine learning engineering | Original direction 2 |
| `data-analytics-science` | Data analytics & data science | Original direction 3 |
| `data-engineering` | Data engineering | Original direction 4 |
| `mlops-platform` | MLOps & AI platform engineering | Original direction 5 |
| `computer-vision-edge` | Computer vision & Edge AI | Original direction 6 |
| `ai-product-consulting` | AI product & implementation consulting | Original direction 7 |
| `ai-automation-operations` | AI automation & operations | Original direction 8 |
| `ai-research` | AI research & research engineering | Original direction 9 |
| `ai-design-content` | AI design & content | Existing creative track retained |

## Discovery behavior

All directions stay visible, including those with zero sample openings. Selecting a tile filters the current results and opens a guide describing the work, learning sequence, capability evidence and a project example. Counts reflect the other current filters, and explicitly refer to sample roles. The global reset clears specialization along with the other filters; All specializations clears only the specialization.

Keyword search includes the specialization title and curated English/Traditional Chinese role aliases. The four existing track filters and workplace filters still combine with specialization. An empty result never hides the selected career guide or manufactures a job to fill the category.

## Source of truth

`src/lib/career-paths.ts` defines stable IDs, names, aliases and guide content. `Job.specialization` links openings to those IDs. This extends the earlier `Job.track` classification without changing saved browser workspace records, which store job IDs rather than copied job objects.

The learning sequences and evidence suggestions are adapted from [the original career playbook](../AI_CAREER_PLAN.md). They are starting frameworks, not universal hiring requirements. Specialized research, infrastructure or domain skills are not implied to be covered by the scaffold's short assessment or six-course demo catalog.

## Regression checks

Unit tests retain all ten directions, validate every fixture mapping, test combined filters and bilingual alias search, and keep empty categories available. Browser tests select every direction, verify the guides, exercise an empty MLOps category and test reset/combined filters. Existing mobile overflow checks include the updated job discovery page.
