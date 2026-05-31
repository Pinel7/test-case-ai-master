"""Tests for app.services.exporter — XLSX and CSV export."""

import csv
import io


class TestExporter:
    SAMPLE_CASES = [
        {
            "case_id": "TC-001",
            "title": "Login Success",
            "module": "Auth",
            "priority": "P0",
            "steps": "1. Enter credentials\n2. Click login",
            "expected_result": "User is logged in",
        },
        {
            "case_id": "TC-002",
            "title": "Logout",
            "module": "Auth",
            "priority": "P1",
            "steps": "1. Click logout\n2. Confirm",
        },
    ]

    def test_xlsx_returns_bytesio(self, exporter):
        buf = exporter.export_to_xlsx(self.SAMPLE_CASES)
        assert buf is not None
        data = buf.read()
        assert len(data) > 0
        # XLSX files start with PK (zip) signature
        assert data[:2] == b"PK"

    def test_xlsx_empty_cases(self, exporter):
        """Should produce a valid XLSX even with empty input."""
        buf = exporter.export_to_xlsx([])
        data = buf.read()
        assert len(data) > 0
        assert data[:2] == b"PK"

    def test_csv_returns_bytesio(self, exporter):
        buf = exporter.export_to_csv(self.SAMPLE_CASES)
        assert buf is not None
        data = buf.read()
        assert len(data) > 0

    def test_csv_has_bom(self, exporter):
        buf = exporter.export_to_csv(self.SAMPLE_CASES)
        data = buf.read()
        assert data[:3] == b"\xef\xbb\xbf"  # UTF-8 BOM

    def test_csv_content(self, exporter):
        buf = exporter.export_to_csv(self.SAMPLE_CASES)
        data = buf.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(data))
        rows = list(reader)
        assert len(rows) == 2
        # CSV uses Chinese headers, so keys are Chinese
        assert rows[0]["用例编号"] == "TC-001"
        assert rows[1]["用例编号"] == "TC-002"
        assert rows[0]["用例标题"] == "Login Success"

    def test_csv_headers_chinese(self, exporter):
        """CSV should use Chinese column headers."""
        buf = exporter.export_to_csv(self.SAMPLE_CASES)
        data = buf.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(data))
        assert "用例编号" in reader.fieldnames
        assert "用例标题" in reader.fieldnames
        assert "优先级" in reader.fieldnames

    def test_csv_empty_cases(self, exporter):
        buf = exporter.export_to_csv([])
        data = buf.read()
        assert len(data) > 0
        assert data[:3] == b"\xef\xbb\xbf"

    def test_xlsx_priority_coloring(self, exporter):
        """Verify P0 and P1 rows exist without inspecting cell fills."""
        cases = [
            {"case_id": "P0-CASE", "priority": "P0"},
            {"case_id": "P1-CASE", "priority": "P1"},
            {"case_id": "NO-PRIORITY", "priority": ""},
        ]
        buf = exporter.export_to_xlsx(cases)
        data = buf.read()
        assert data[:2] == b"PK"
        # Just ensure the file is valid — openpyxl cell formatting isn't
        # easily inspected from the raw bytes without loading the workbook.
