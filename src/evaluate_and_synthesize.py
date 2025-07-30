from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm_studio")

with open("prompts/evaluate.md", "r") as f:
    evaluate_prompt = f.read()

plans = sorted(Path(".").glob("search_plan_*.txt"), key=lambda p: p.name)
reports = sorted(Path(".").glob("report_search_plan_*.txt"), key=lambda p: p.name)
if len(plans) != len(reports):
    raise ValueError("Number of plans and reports do not match.")


class Evaluation(BaseModel):
    is_relevant: bool
    relevance_rating_reason: str
    is_thorough: bool
    thorough_rating_reason: str

passed_reports = []

for plan, report in zip(plans, reports):
    print(f"Evaluating {plan.name} with {report.name}")
    with open(plan, "r") as f:
        plan_content = f.read()
    with open(report, "r") as f:
        report_content = f.read().split('</think>')[1].split('=== SEARCH AGENT DEBUG LOG ===')[0].strip()

    user_input = f"""<SEARCH PLAN>
{plan_content}
</SEARCH PLAN>

<REPORT>
{report_content}
</REPORT>
    """

    response = client.beta.chat.completions.parse(
        model="qwen/qwen3-14b",
        messages=[
            {"role": "system", "content": evaluate_prompt},
            {"role": "user", "content": user_input}
        ],
        response_format=Evaluation
    )

    report_evaluation = response.choices[0].message.content

    if report_evaluation["is_relevant"] and report_evaluation["is_thorough"]:
        passed_reports.append(report_content)


