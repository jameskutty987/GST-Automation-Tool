from datetime import datetime

class GSTR1Engine:
    @staticmethod
    def format_month(period_str):
        try:
            return datetime.strptime(period_str, "%m%Y").strftime("%B %Y")
        except:
            return period_str

    @staticmethod
    def extract_all_sections(data):
        # GSTR-1 uses 'fp' for Financial Period
        period = data.get("fp", "000000")
        month_label = GSTR1Engine.format_month(period)

        # --- 1. B2B Outward Supply ---
        b2b_data = []
        for party in data.get("b2b", []):
            ctin = party.get("ctin")
            for inv in party.get("inv", []):
                inum, idt, val, pos = inv.get("inum"), inv.get("idt"), inv.get("val"), inv.get("pos")
                for itm in inv.get("itms", []):
                    det = itm.get("itm_det", {})
                    b2b_data.append({
                        "Month": month_label,
                        "Recipient GSTIN": ctin,
                        "Invoice Number": inum,
                        "Invoice Date": idt,
                        "Invoice Value": val,
                        "Place of Supply": pos,
                        "Rate": det.get("rt", 0),
                        "Taxable Value": det.get("txval", 0),
                        "IGST": det.get("iamt", 0),
                        "CGST": det.get("camt", 0),
                        "SGST": det.get("samt", 0)
                    })

        # --- 2. B2C Report (Combined B2CS & B2BL) ---
        b2c_combined = []
        for b2bl_inv in data.get("b2bl", []):
            pos = b2bl_inv.get("pos")
            for inv in b2bl_inv.get("inv", []):
                for itm in inv.get("itms", []):
                    det = itm.get("itm_det", {})
                    b2c_combined.append({
                        "Month": month_label,
                        "Type": "B2B-Large",
                        "Invoice/POS": inv.get("inum"),
                        "POS": pos,
                        "Rate": det.get("rt", 0),
                        "Taxable Value": det.get("txval", 0),
                        "IGST": det.get("iamt", 0),
                        "CGST": 0, "SGST": 0
                    })
        for b2cs in data.get("b2cs", []):
            b2c_combined.append({
                "Month": month_label,
                "Type": "B2B-Small",
                "Invoice/POS": b2cs.get("pos"),
                "POS": b2cs.get("pos"),
                "Rate": b2cs.get("rt", 0),
                "Taxable Value": b2cs.get("txval", 0),
                "IGST": b2cs.get("iamt", 0),
                "CGST": b2cs.get("camt", 0),
                "SGST": b2cs.get("samt", 0)
            })

        # --- 3. HSN Summary ---
        hsn_summary = []
        for h in data.get("hsn", {}).get("data", []):
            hsn_summary.append({
                "Month": month_label,
                "HSN Code": h.get("hsn_sc"),
                "Description": h.get("desc"),
                "UQC": h.get("uqc"),
                "Qty": h.get("qty"),
                "Taxable Value": h.get("txval"),
                "Rate": h.get("rt"),
                "IGST": h.get("iamt", 0),
                "CGST": h.get("camt", 0),
                "SGST": h.get("samt", 0)
            })

        return {
            "period": period,
            "month": month_label,
            "B2B Outward Supply": b2b_data,
            "B2C Report": b2c_combined,
            "Hsn wise Outward Supply Report": hsn_summary
        }