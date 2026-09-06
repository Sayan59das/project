import requests
import json

BASE_URL = "http://127.0.0.0:8000/api/v1" # Or your ngrok URL

def run_test():
    print("=== Phase 2: Testing /read-label ===")
    # Note: Replace 'sample_label.jpg' with a real file path in your environment
    with open("sample_label.jpg", "wb") as f:
        f.write(b"mock image bytes") # We use a mock file just for testing the structure

    with open("sample_label.jpg", "rb") as f:
        # Assuming the backend is running with use_mock=True, any file triggers the mock output
        files = {"file": ("sample_label.jpg", f, "image/jpeg")}
        response = requests.post(f"{BASE_URL}/read-label", files=files)
        
    print(f"Status Code: {response.status_code}")
    extracted_label = response.json()
    print("Extracted Label (Notice logo is nullified due to low confidence):")
    print(json.dumps(extracted_label, indent=2))

    print("\n=== Phase 3: Testing /compare-label ===")
    
    payload = {
        "source_label": extracted_label,
        "approved_version": {
            "version_id": "v1.0",
            "artwork_id": "art-001",
            "is_approved": True,
            "label_data": extracted_label # Mocking identical data for testing MATCH
        },
        "cross_company_labels": []
    }
    
    compare_response = requests.post(f"{BASE_URL}/compare-label", json=payload)
    eval_results = compare_response.json()
    print(json.dumps(eval_results, indent=2))
    
    print("\n=== Phase 4: Testing /generate-report ===")
    report_payload = {
        "evaluation_results": eval_results["version_comparison"],
        "cross_company_match": eval_results.get("cross_company_best_match")
    }
    
    # We send this as JSON rather than parameters
    report_response = requests.post(f"{BASE_URL}/generate-report", json=report_payload)
    
    if report_response.status_code == 200:
        with open("test_report.pdf", "wb") as f:
            f.write(report_response.content)
        print("✅ Successfully generated test_report.pdf!")
    else:
        print("Failed to generate report.")

if __name__ == "__main__":
    try:
        run_test()
    except Exception as e:
        print(f"Error connecting to server. Is it running? {e}")
