import streamlit as st
import pandas as pd
import json
import io
from datetime import datetime
from gstr1_engine import GSTR1Engine

# ==========================================
# 1. BASE / ENGINE LAYER
# ==========================================
class BaseReturnEngine:
    @staticmethod
    def extract_all_sections(data):
        raise NotImplementedError("Subclasses must implement extract_all_sections")


class GSTR3BEngine(BaseReturnEngine):
    @staticmethod
    def extract_all_sections(data):
        period = data.get("ret_period", "000000")
        month_label = DataService.format_month_label(period)

        sup = data.get("sup_details", {})
        osup = sup.get("osup_det", {})
        isup_rev = sup.get("isup_rev", {})
        osup_zero = sup.get("osup_zero", {})
        osup_nil = sup.get("osup_nil_exmp", {})
        osup_nongst = sup.get("osup_nongst", {})

        sec95 = data.get("sec95_details", {})
        eco_dtls = data.get("eco_dtls", {})
        eco_det = sec95.get("eco_det", {}) or eco_dtls.get("eco_sup", {})
        reg_det = sec95.get("reg_det", {}) or eco_dtls.get("eco_reg_sup", {})

        inter = data.get("inter_sup", {})

        def sum_inter(datalist):
            return {
                "txval": sum((x.get('txval', 0) or 0) for x in datalist),
                "iamt": sum((x.get('iamt', 0) or 0) for x in datalist)
            }

        u_data = sum_inter(inter.get("unreg_details", []))
        c_data = sum_inter(inter.get("comp_details", []))
        ui_data = sum_inter(inter.get("uin_details", []))

        itc_elg = data.get("itc_elg", {})
        itc_avl = itc_elg.get("itc_avl", [])
        rc_itc = next((x for x in itc_avl if x.get('ty') == 'ISRC'), {})
        oth_itc = next((x for x in itc_avl if x.get('ty') == 'OTH'), {})
        itc_inelg = next((x for x in itc_elg.get("itc_inelg", []) if x.get('ty') == 'RUL'), {})
        itc_rev = next((x for x in itc_elg.get("itc_rev", []) if x.get('ty') == 'RUL'), {})
        itc_net = itc_elg.get("itc_net", {})

        intr_det = (
            data.get("intr_details", {}).get("intr_amt", {})
            or data.get("intr_ltfee", {}).get("intr_details", {})
        )
        lt_fee_orig = (
            data.get("in_lt_fee", {}).get("lt_fee", {})
            or data.get("intr_ltfee", {}).get("ltfee_details", {})
        )

        # --- FIXED 6.1 PAYMENT OF TAX MAPPING ---
        tax_pd = (
            data.get("taxpayble", {})
                .get("returnsDbCdredList", {})
                .get("tax_paid", {})
        )
        pd_itc = tax_pd.get("pd_by_itc", [])
        pd_cash = tax_pd.get("pd_by_cash", [])

        def sum_itc(field):
            return sum((row.get(field, 0) or 0) for row in pd_itc)

        def sum_cash(head, field):
            head = head.lower()
            return sum(((row.get(head, {}) or {}).get(field, 0) or 0) for row in pd_cash)

        return {
            "period": period,
            "month": month_label,
            "3.1 Outward supplies and RCM": {
                "Month": month_label,
                "Taxable Value": osup.get("txval", 0), "IGST": osup.get("iamt", 0), "CGST": osup.get("camt", 0), "SGST/UTGST": osup.get("samt", 0), "Cess": osup.get("csamt", 0),
                "RCM Taxable": isup_rev.get("txval", 0), "RCM CGST": isup_rev.get("camt", 0), "RCM SGST": isup_rev.get("samt", 0),
                "Zero Taxable": osup_zero.get("txval", 0), "Zero IGST": osup_zero.get("iamt", 0), "Zero CGST": osup_zero.get("camt", 0), "Zero SGST": osup_zero.get("samt", 0), "Zero Cess": osup_zero.get("csamt", 0),
                "Nil Taxable": osup_nil.get("txval", 0), "Nil IGST": osup_nil.get("iamt", 0), "Nil CGST": osup_nil.get("camt", 0), "Nil SGST": osup_nil.get("samt", 0), "Nil Cess": osup_nil.get("csamt", 0),
                "Non-GST Taxable": osup_nongst.get("txval", 0), "Non-GST IGST": osup_nongst.get("iamt", 0), "Non-GST CGST": osup_nongst.get("camt", 0), "Non-GST SGST": osup_nongst.get("samt", 0), "Non-GST Cess": osup_nongst.get("csamt", 0),
            },
            "3.1.1 Section 9(5)": {
                "Month": month_label,
                "ECO Pays Taxable": eco_det.get("txval", 0), "ECO Pays IGST": eco_det.get("iamt", 0), "ECO Pays CGST": eco_det.get("camt", 0), "ECO Pays SGST": eco_det.get("samt", 0), "ECO Pays Cess": eco_det.get("csamt", 0),
                "Through ECO Taxable": reg_det.get("txval", 0), "Through ECO IGST": reg_det.get("iamt", 0), "Through ECO CGST": reg_det.get("camt", 0), "Through ECO SGST": reg_det.get("samt", 0), "Through ECO Cess": reg_det.get("csamt", 0),
            },
            "3.2 Inter-state supplies": {
                "Month": month_label,
                "Unreg Taxable": u_data["txval"], "Unreg IGST": u_data["iamt"],
                "Comp Taxable": c_data["txval"], "Comp IGST": c_data["iamt"],
                "UIN Taxable": ui_data["txval"], "UIN IGST": ui_data["iamt"]
            },
            "4. Eligible ITC": {
                "Month": month_label,
                "RC_IGST": rc_itc.get("iamt", 0), "RC_CGST": rc_itc.get("camt", 0), "RC_SGST": rc_itc.get("samt", 0),
                "OTH_IGST": oth_itc.get("iamt", 0), "OTH_CGST": oth_itc.get("camt", 0), "OTH_SGST": oth_itc.get("samt", 0),
                "INELG_IGST": itc_inelg.get("iamt", 0), "INELG_CGST": itc_inelg.get("camt", 0), "INELG_SGST": itc_inelg.get("samt", 0),
                "REV_IGST": itc_rev.get("iamt", 0), "REV_CGST": itc_rev.get("camt", 0), "REV_SGST": itc_rev.get("samt", 0),
                "NET_IGST": itc_net.get("iamt", 0), "NET_CGST": itc_net.get("camt", 0), "NET_SGST": itc_net.get("samt", 0)
            },
            "5.1 Interest and Late fee": {
                "Month": month_label,
                "Sys_IGST": intr_det.get("iamt", 0), "Sys_CGST": intr_det.get("camt", 0), "Sys_SGST": intr_det.get("samt", 0),
                "Paid_IGST": sum_cash("igst", "intr"), "Paid_CGST": sum_cash("cgst", "intr"), "Paid_SGST": sum_cash("sgst", "intr"),
                "LF_IGST": sum_cash("igst", "fee"), "LF_CGST": sum_cash("cgst", "fee"), "LF_SGST": sum_cash("sgst", "fee")
            },
            "6.1 Payment of tax": {
                "Month": month_label,

                # IGST colored head
                "I_O": osup.get("iamt", 0),
                "I_R": isup_rev.get("iamt", 0),
                "I_L": osup.get("iamt", 0) + isup_rev.get("iamt", 0),
                "I_I_U": sum_itc("igst_igst_amt"),
                "I_C_U": sum_itc("igst_cgst_amt"),
                "I_S_U": sum_itc("igst_sgst_amt"),
                "I_CP": sum_cash("igst", "tx"),
                "I_IN": sum_cash("igst", "intr"),
                "I_LF": sum_cash("igst", "fee"),

                # CGST colored head
                "C_O": osup.get("camt", 0),
                "C_R": isup_rev.get("camt", 0),
                "C_L": osup.get("camt", 0) + isup_rev.get("camt", 0),
                "C_C_U": sum_itc("cgst_cgst_amt"),
                "C_I_U": sum_itc("cgst_igst_amt"),
                "C_CP": sum_cash("cgst", "tx"),
                "C_IN": sum_cash("cgst", "intr"),
                "C_LF": sum_cash("cgst", "fee"),

                # SGST colored head
                "S_O": osup.get("samt", 0),
                "S_R": isup_rev.get("samt", 0),
                "S_L": osup.get("samt", 0) + isup_rev.get("samt", 0),
                "S_S_U": sum_itc("sgst_sgst_amt"),
                "S_I_U": sum_itc("sgst_igst_amt"),
                "S_CP": sum_cash("sgst", "tx"),
                "S_IN": sum_cash("sgst", "intr"),
                "S_LF": sum_cash("sgst", "fee")
            }
        }


class GSTR1Engine(BaseReturnEngine):
    @staticmethod
    def extract_all_sections(data):
        period = data.get("ret_period", "000000")
        month_label = DataService.format_month_label(period)
        return {
            "period": period,
            "month": month_label
        }


# ==========================================
# 2. SERVICE LAYER: LOGIC & EXCEL
# ==========================================
class DataService:
    @staticmethod
    def format_month_label(period_str):
        try:
            return datetime.strptime(period_str, "%m%Y").strftime("%B %Y")
        except:
            return period_str

    @staticmethod
    def sort_chronologically(data_list):
        valid_items = []
        for item in data_list:
            try:
                datetime.strptime(item['period'], "%m%Y")
                valid_items.append(item)
            except:
                pass
        unique_map = {item['period']: item for item in valid_items}
        return sorted(unique_map.values(), key=lambda x: datetime.strptime(x['period'], "%m%Y"))

    @staticmethod
    def get_financial_year(period_str):
        month, year = int(period_str[:2]), int(period_str[2:])
        return f"{year-1}-{year}" if month <= 3 else f"{year}-{year+1}"

    @staticmethod
    def to_excel_formatted(df, fy_label, report_choice):
        output = io.BytesIO()
        data_start_row = 3
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='GST_Analysis', startrow=data_start_row, header=False)
            workbook, worksheet = writer.book, writer.sheets['GST_Analysis']

            bold_border = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'valign': 'vcenter'})
            header_format = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#F2F2F2'})
            accounting_format = workbook.add_format({'num_format': '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 'border': 1})
            text_border = workbook.add_format({'border': 1})
            blue_hdr = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'bg_color': '#CCE5FF'})
            red_hdr = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'bg_color': '#F8D7DA'})
            orange_hdr = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'bg_color': '#FFF3CD'})

            worksheet.write(0, 0, fy_label, bold_border)

            if report_choice == "3.1 Outward supplies and RCM":
                worksheet.merge_range('B2:F2', 'Outward taxable supplies', header_format)
                worksheet.merge_range('G2:I2', 'Inward supplies (RCM)', header_format)
                worksheet.merge_range('J2:N2', 'Zero rated', header_format)
                worksheet.merge_range('O2:S2', 'Nil/Exempt', header_format)
                worksheet.merge_range('T2:X2', 'Non-GST', header_format)
                sub = ["Month", "Taxable Value", "IGST", "CGST", "SGST", "Cess", "Taxable", "CGST", "SGST", "Taxable", "IGST", "CGST", "SGST", "Cess", "Taxable", "IGST", "CGST", "SGST", "Cess", "Taxable", "IGST", "CGST", "SGST", "Cess"]
                worksheet.write_row(2, 0, sub, bold_border)

            elif report_choice == "3.1.1 Section 9(5)":
                worksheet.merge_range('B2:F2', 'ECO pays tax', header_format)
                worksheet.merge_range('G2:K2', 'Through ECO', header_format)
                worksheet.write_row(2, 0, ["Month", "Taxable", "IGST", "CGST", "SGST", "Cess", "Taxable", "IGST", "CGST", "SGST", "Cess"], bold_border)

            elif report_choice == "3.2 Inter-state supplies":
                worksheet.merge_range('B1:G1', '3.2 details of inter-state supplies', header_format)
                worksheet.merge_range('B2:C2', 'Unregistered', header_format)
                worksheet.merge_range('D2:E2', 'Composition', header_format)
                worksheet.merge_range('F2:G2', 'UIN', header_format)
                worksheet.write_row(2, 0, ["Month", "Taxable", "IGST", "Taxable", "IGST", "Taxable", "IGST"], bold_border)

            elif report_choice == "4. Eligible ITC":
                worksheet.merge_range('B1:G1', 'ITC Available', header_format)
                worksheet.merge_range('B2:D2', 'RCM', header_format)
                worksheet.merge_range('E2:G2', 'Others', header_format)
                worksheet.merge_range('H2:J2', 'Ineligible', header_format)
                worksheet.merge_range('K2:M2', 'Reversed', header_format)
                worksheet.merge_range('N2:P2', 'Net', header_format)
                worksheet.write_row(2, 0, ["Month", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST"], bold_border)

            elif report_choice == "5.1 Interest and Late fee":
                worksheet.merge_range('B1:J1', 'Interest & Late Fee', header_format)
                worksheet.merge_range('B2:D2', 'System Interest', header_format)
                worksheet.merge_range('E2:G2', 'Paid Interest', header_format)
                worksheet.merge_range('H2:J2', 'Late Fee', header_format)
                worksheet.write_row(2, 0, ["Month", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST", "IGST", "CGST", "SGST"], bold_border)

            elif report_choice == "6.1 Payment of tax":
                worksheet.merge_range('B1:J1', 'IGST', blue_hdr)
                worksheet.merge_range('K1:R1', 'CGST', red_hdr)
                worksheet.merge_range('S1:Z1', 'SGST', orange_hdr)

                worksheet.merge_range('B2:D2', 'IGST Tax Liabiity', header_format)
                worksheet.merge_range('E2:G2', 'ITC Utilisation', header_format)
                worksheet.merge_range('H2:J2', 'Other Details', header_format)

                worksheet.merge_range('K2:M2', 'CGST Tax Liabiity', header_format)
                worksheet.merge_range('N2:O2', 'ITC Utilisation', header_format)
                worksheet.merge_range('P2:R2', 'Other Details', header_format)

                worksheet.merge_range('S2:U2', 'SGST Tax Liabiity', header_format)
                worksheet.merge_range('V2:W2', 'ITC Utilisation', header_format)
                worksheet.merge_range('X2:Z2', 'Other Details', header_format)

                sub = [
                    "Month",
                    "Other Than RCM", "RCM", "Tax Liability", "Igst ITC Utilized", "Cgst ITC Utilized", "Sgst ITC Utilized", "Cash Paid (Tax)", "Interest", "Late Fee",
                    "Other Than RCM", "RCM", "Tax Liability", "Cgst ITC Utilized", "Igst ITC Utilized", "Cash Paid (Tax)", "Interest", "Late Fee",
                    "Other Than RCM", "RCM", "Tax Liability", "Sgst ITC Utilized", "Igst ITC Utilized", "Cash Paid (Tax)", "Interest", "Late Fee"
                ]
                worksheet.write_row(2, 0, sub, bold_border)

            worksheet.set_column('A:A', 15)
            worksheet.set_column('B:Z', 18)

            for row_idx in range(len(df)):
                write_row = data_start_row + row_idx
                worksheet.write(write_row, 0, df.iloc[row_idx, 0], text_border)
                for col_idx in range(1, len(df.columns)):
                    worksheet.write(write_row, col_idx, df.iloc[row_idx, col_idx], accounting_format)

        return output.getvalue()


class AppConfig:
    MODULES = {
        "GSTR-3B": {
            "engine": GSTR3BEngine,
            "reports": [
                "3.1 Outward supplies and RCM",
                "3.1.1 Section 9(5)",
                "3.2 Inter-state supplies",
                "4. Eligible ITC",
                "5.1 Interest and Late fee",
                "6.1 Payment of tax"
            ]
        },
        "GSTR-1": {
            "engine": GSTR1Engine,
            "reports": [
                "B2B Sales",
                "B2C Small",
                "B2C Large",
                "HSN Summary"
            ]
        }
    }


# ==========================================
# 3. UI LAYER
# ==========================================
def main():
    st.set_page_config(page_title="GST Master", layout="wide")

    if "uploader_key" not in st.session_state:
        st.session_state.uploader_key = 0

    st.sidebar.title("GST Modules")
    selected_module = st.sidebar.radio("Select Return", list(AppConfig.MODULES.keys()))
    st.title(f"📊 {selected_module} Multi-Month Aggregator")

    module_conf = AppConfig.MODULES[selected_module]
    engine_cls = module_conf["engine"]

    upload_col, reset_col = st.columns([8, 1])
    with upload_col:
        uploaded_files = st.file_uploader(
            "Upload JSON files",
            type="json",
            accept_multiple_files=True,
            key=f"json_uploader_{st.session_state.uploader_key}",
            help="You can browse or drag and drop multiple JSON files here."
        )
    with reset_col:
        st.write("")
        st.write("")
        if st.button("Reset", use_container_width=True):
            st.session_state.uploader_key += 1
            st.rerun()

    if uploaded_files:
        processed_data, fy_list = [], set()
        duplicate_periods = []

        seen_periods = set()

        for f in uploaded_files:
            try:
                f.seek(0)
                raw_json = json.load(f)

                period = raw_json.get("ret_period")
                if not period:
                    st.error(f"Missing ret_period in file: {f.name}")
                    continue

                fy_list.add(DataService.get_financial_year(period))

                if period in seen_periods:
                    duplicate_periods.append(period)
                seen_periods.add(period)

                extracted = engine_cls.extract_all_sections(raw_json)
                processed_data.append(extracted)

            except Exception as e:
                st.error(f"Error reading {f.name}: {e}")

        if duplicate_periods:
            dup_months = ", ".join(sorted(set(DataService.format_month_label(p) for p in duplicate_periods)))
            st.warning(f"Duplicate return periods found. Latest uploaded file kept for: {dup_months}")

        if processed_data:
            final_list = DataService.sort_chronologically(processed_data)

            if selected_module == "GSTR-1":
                st.info("GSTR-1 extension scaffold is ready. Add GSTR-1 extraction/report logic later in GSTR1Engine.")
                return

            if len(fy_list) == 1:
                fy_display = list(fy_list)[0]
            else:
                st.error("Please upload files from a single financial year only.")
                return

            report_options = module_conf["reports"]
            choice = st.selectbox("Select Report View", report_options)

            df = pd.DataFrame([d[choice] for d in final_list])

            st.dataframe(df, use_container_width=True)

            st.download_button(
                label="📥 Download Excel",
                data=DataService.to_excel_formatted(df, fy_display, choice),
                file_name=f"{choice.replace(' ', '_').replace('/', '_')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )


if __name__ == "__main__":
    main()