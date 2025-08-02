import json

from openai import OpenAI
from pydantic import BaseModel

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm_studio")


class SearchPlans(BaseModel):
    search_plans: list[str]


with open("prompts/plan.md", "r") as f:
    prompt = f.read()

with open("doc_report.txt", "r") as f:
    doc_report = f.read()


user_query = "I want to understand what we know about LLM energy usage. It seems like a complicated topic with a lot of ambiguity, so I'd like to see what factors are relevant and what perspectives are out there."

deterministic_blob = """OUTPUT STRUCTURE:
- Objective: [Original search objective]
- Executive summary: [3-5 sentence summary of findings]
- Details: [Sections describing key details, each with their own header]
"""

user_input = f"""<report>
{doc_report}
</report>

<user_query>
{user_query}
</user_query>
"""

response = client.beta.chat.completions.parse(
    model="qwen/qwen3-14b",
    messages=[
        {"role": "system", "content": prompt},
        {"role": "user", "content": user_input},
    ],
    response_format=SearchPlans,
)

resp_object = response.choices[0].message.content
resp_plans = json.loads(resp_object)
resp_plans = SearchPlans(**resp_plans)

print("Search Plans:")
for i, plan in enumerate(resp_plans.search_plans, start=1):
    print(f"Plan {i}:\n{plan}\n")
    with open(f"search_plan_{i}.txt", "w") as f:
        f.write(plan + "\n\n" + deterministic_blob)
