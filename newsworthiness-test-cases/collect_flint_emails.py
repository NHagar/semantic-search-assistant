import csv

import requests

base_url = "https://s-lib007.lib.uiowa.edu/flint/api/api.php/records/emails"
page_size = 100  # number of records per page
page = 1
all_records = []

while True:
    url = f"{base_url}?page={page},{page_size}&order=id"
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()
    records = data.get("records", [])
    if not records:
        break  # no more records
    all_records.extend(records)
    print(f"Fetched page {page} with {len(records)} records")
    page += 1

# write selected fields to CSV
with open("flint_emails.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(
        [
            "id",
            "timestamp",
            "sender",
            "recipient_to",
            "recipient_cc",
            "subject",
            "full_text",
        ]
    )
    for rec in all_records:
        writer.writerow(
            [
                rec["id"],
                rec["timestamp"],
                rec["sender"],
                rec["recipient_to"],
                rec["recipient_cc"],
                rec["subject"],
                rec["full_text"],
            ]
        )
print(f"Saved {len(all_records)} emails to flint_emails.csv")
