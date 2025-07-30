from pathlib import Path

from openai import OpenAI

plans = list(Path(".").glob("search_plan_*.txt"))
reports = list(Path(".").glob("report_search_plan_*.txt"))
if len(plans) != len(reports):
    raise ValueError("Number of plans and reports do not match.")

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm_studio")


