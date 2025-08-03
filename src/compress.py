from openai import OpenAI

from .extract_and_sample_pdfs import process_pdfs_and_sample

client = OpenAI(base_url="http://localhost:1234/v1", api_key="lm_studio")

with open("prompts/compress.md", "r") as f:
    prompt = f.read()


compressed_docs = process_pdfs_and_sample(
    data_dir="data", n_tokens=100, token_budget=6500, save_txt_files=False
)

response = client.chat.completions.create(
    model="qwen/qwen3-14b",
    messages=[
        {"role": "system", "content": prompt},
        {"role": "user", "content": compressed_docs},
    ],
)

print(response.choices[0].message.content)
with open("doc_report.txt", "w") as f:
    f.write(response.choices[0].message.content)
