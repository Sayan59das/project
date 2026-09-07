from typing import List, Dict, Any, Optional
import torch
from sentence_transformers import SentenceTransformer, util
from app.schemas.label import ExtractedLabel, Version

class ComparisonService:
    def __init__(self):
        # We load a small semantic similarity model
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')

    def _get_status(self, score: float, threshold_match=0.85, threshold_similar=0.65) -> str:
        if score >= threshold_match:
            return "🟢 MATCH"
        elif score >= threshold_similar:
            return "🟡 SIMILAR"
        else:
            return "🔴 CONFLICT"

    def compare_semantic_texts(self, text_a: str, text_b: str) -> str:
        if not text_a or not text_b:
            return "⚪ MISSING"
            
        emb_a = self.encoder.encode(text_a, convert_to_tensor=True)
        emb_b = self.encoder.encode(text_b, convert_to_tensor=True)
        cosine_scores = util.cos_sim(emb_a, emb_b)
        return self._get_status(cosine_scores.item())
        
    def compare_lists(self, list_a: List[str], list_b: List[str]) -> str:
        if not list_a or not list_b:
            return "⚪ MISSING"
            
        # Compare claims/ingredients by aggregating semantic similarity symmetrically
        def get_directional_score(l1: List[str], l2: List[str]) -> float:
            score = 0.0
            emb_l2 = self.encoder.encode(l2, convert_to_tensor=True)
            for item in l1:
                emb_item = self.encoder.encode(item, convert_to_tensor=True)
                cosine_scores = util.cos_sim(emb_item, emb_l2)
                score += torch.max(cosine_scores).item()
            return score / len(l1)
            
        score_a_to_b = get_directional_score(list_a, list_b)
        score_b_to_a = get_directional_score(list_b, list_a)
        
        avg_score = (score_a_to_b + score_b_to_a) / 2
        return self._get_status(avg_score)

    def compare_exact_or_missing(self, val_a: Any, val_b: Any) -> str:
        if not val_a or not val_b:
            return "⚪ MISSING"
        if val_a == val_b:
            return "🟢 MATCH"
        return "🔴 CONFLICT"

    def evaluate_labels(self, source: ExtractedLabel, target: ExtractedLabel) -> Dict[str, str]:
        """Compares two ExtractedLabel objects and returns a dictionary of statuses."""
        return {
            "brand_name": self.compare_exact_or_missing(source.brand_name, target.brand_name),
            "product_name": self.compare_semantic_texts(source.product_name, target.product_name),
            "colour_theme": self.compare_lists(source.colour_theme or [], target.colour_theme or []),
            "flavour": self.compare_exact_or_missing(source.flavour, target.flavour),
            "claims": self.compare_lists(source.claims or [], target.claims or []),
            "logo": self.compare_semantic_texts(source.logo, target.logo),
            "layout": self.compare_semantic_texts(source.layout, target.layout),
            "fssai_number": self.compare_exact_or_missing(source.fssai_number, target.fssai_number),
            "ingredients": self.compare_lists(source.ingredients or [], target.ingredients or []),
            "marketing_company": self.compare_exact_or_missing(source.marketing_company, target.marketing_company),
            "address": self.compare_semantic_texts(source.address, target.address),
            "customer_care_number": self.compare_exact_or_missing(source.customer_care_number, target.customer_care_number),
            "customer_care_email": self.compare_exact_or_missing(source.customer_care_email, target.customer_care_email),
            "package_size": self.compare_exact_or_missing(source.package_size, target.package_size),
            "manufacturing_company": self.compare_exact_or_missing(source.manufacturing_company, target.manufacturing_company)
        }

    def find_best_cross_company_match(self, source_label: ExtractedLabel, external_labels: List[ExtractedLabel]) -> Optional[Dict]:
        """Stage 2: Evaluate similar labels from other companies."""
        if not external_labels:
            return None
            
        best_match = None
        highest_score = -1
        
        # Fields that SHOULD be different across companies
        company_specific_fields = ["marketing_company", "fssai_number", "address", "customer_care_number", "customer_care_email"]
        
        for ext_label in external_labels:
            eval_results = self.evaluate_labels(source_label, ext_label)
            score = 0
            
            for field, status in eval_results.items():
                if field in company_specific_fields:
                    continue # Do not reward matches on company-specific fields
                if status == "🟢 MATCH": score += 2
                elif status == "🟡 SIMILAR": score += 1
            
            if score > highest_score:
                highest_score = score
                best_match = {
                    "label": ext_label,
                    "evaluation": eval_results,
                    "score": score
                }
                
        return best_match

