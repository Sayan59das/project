import io
import json
import torch
from PIL import Image
from pdf2image import convert_from_bytes
from app.schemas.label import ExtractedLabel

class ExtractionService:
    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock
        if not self.use_mock:
            # Initialize the Multimodal VLM (e.g., DeepSeek-VL)
            from transformers import AutoModelForCausalLM, AutoProcessor
            print("Loading DeepSeek-VL model into GPU... This will use HF_HOME cache.")
            model_path = "deepseek-ai/deepseek-vl-1.3b-chat"
            self.processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
            self.model = AutoModelForCausalLM.from_pretrained(model_path, trust_remote_code=True).to("cuda" if torch.cuda.is_available() else "cpu")

    def enforce_confidence(self, field_value, confidence: float):
        """Zero Hallucination: Force output to null if confidence < 0.80"""
        if confidence < 0.80:
            return None
        return field_value

    def extract_from_image(self, image: Image.Image) -> ExtractedLabel:
        if not self.use_mock:
            # Real VLM Inference Logic
            # Instruct the model to extract fields with confidence scores
            prompt = (
                "Analyze this product label image. Extract the following fields as a JSON object: "
                "brand_name, product_name, colour_theme, flavour, claims, logo, layout, "
                "nutrition_table, fssai_number, ingredients, marketing_company, address, "
                "customer_care_number, customer_care_email, package_size, manufacturing_company. "
                "For each field, return a dictionary with 'value' and 'confidence' (0.0 to 1.0) evaluating how sure you are."
            )
            
            # Format inputs according to DeepSeek-VL processor requirements
            messages = [{"role": "User", "content": f"<image_placeholder> {prompt}"}]
            inputs = self.processor(conversations=messages, images=[image], return_tensors="pt").to(self.model.device)
            
            with torch.no_grad():
                outputs = self.model.generate(**inputs, max_new_tokens=1024)
            
            response_text = self.processor.decode(outputs[0], skip_special_tokens=True)
            
            try:
                # Attempt to parse the JSON output from the model
                # (In production, you'd want robust JSON extraction logic here using regex to find the {} block)
                start_idx = response_text.find('{')
                end_idx = response_text.rfind('}') + 1
                vlm_raw_output = json.loads(response_text[start_idx:end_idx])
            except (json.JSONDecodeError, ValueError):
                print(f"Failed to parse VLM output as JSON: {response_text}")
                vlm_raw_output = {}

        else:
            # Mock Data fallback for immediate testing without GPU
            vlm_raw_output = {
                "brand_name": {"value": "HealthPlus", "confidence": 0.95},
                "product_name": {"value": "Vitamin C Gummies", "confidence": 0.85},
                "colour_theme": {"value": ["Orange", "Yellow"], "confidence": 0.90},
                "flavour": {"value": "Orange", "confidence": 0.88},
                "claims": {"value": ["Immunity Booster", "No Added Sugar"], "confidence": 0.92},
                "logo": {"value": "Orange Shield", "confidence": 0.75}, # Will be nullified (< 0.80)
                "layout": {"value": "Centered text, top logo", "confidence": 0.85},
                "nutrition_table": {"value": {"Vitamin C": "50mg"}, "confidence": 0.91},
                "fssai_number": {"value": "12345678901234", "confidence": 0.99},
                "ingredients": {"value": ["Ascorbic Acid", "Pectin"], "confidence": 0.89},
                "marketing_company": {"value": "HealthPlus India", "confidence": 0.92},
                "address": {"value": "123 Health Ave, Mumbai", "confidence": 0.95},
                "customer_care_number": {"value": "1800-123-456", "confidence": 0.98},
                "customer_care_email": {"value": "care@healthplus.com", "confidence": 0.96},
                "package_size": {"value": "30 Gummies", "confidence": 0.90},
                "manufacturing_company": {"value": "Wellness Mfg Ltd", "confidence": 0.91}
            }
        
        # Apply the Zero Hallucination Rule strictly
        label_data = {}
        for key, data in vlm_raw_output.items():
            if isinstance(data, dict) and "value" in data and "confidence" in data:
                label_data[key] = self.enforce_confidence(data["value"], data["confidence"])
            else:
                label_data[key] = None
        
        # We use model_validate/parse_obj to safely ignore extra fields and enforce types
        return ExtractedLabel(**label_data)

    def process_file(self, file_bytes: bytes, filename: str) -> ExtractedLabel:
        if filename.lower().endswith(".pdf"):
            images = convert_from_bytes(file_bytes)
            target_image = images[0]
        else:
            target_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            
        return self.extract_from_image(target_image)
