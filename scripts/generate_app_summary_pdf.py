from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "output" / "pdf" / "guide-pup-app-summary.pdf"
PNG_PATH = ROOT / "tmp" / "pdfs" / "guide-pup-app-summary-page-1.png"

TITLE = "Guide Pup: Vision Assistant"
SUBTITLE = "One-page repo summary based on README, Expo config, routes, AI logic, and settings code."

LEFT_SECTIONS = [
    (
        "What It Is",
        [
            "Voice-first Expo / React Native prototype for camera-based scene guidance for visually impaired users.",
            "Current repo state: accessible navigation flow plus a second, more stylized capture / inspiration flow; production backend is not found in repo.",
        ],
    ),
    (
        "Who It's For",
        [
            "Primary persona: blind or low-vision users who need spoken scene descriptions and simple movement cues while holding a phone.",
        ],
    ),
    (
        "What It Does",
        [
            "Onboarding explains permissions and voice-first usage.",
            "Home screen starts guidance with one large touch target; long press SOS is a placeholder.",
            "Navigation mode captures frames about every 4.5s and speaks directions plus scene context.",
            "Vision analysis returns obstacles, path clearance, hazard level, lighting, surface type, and a recommended direction.",
            "Haptics reinforce stop / turn / forward states.",
            "Settings persist speech rate, description detail, and a bounding-box debug toggle in AsyncStorage.",
            "A separate tabbed capture screen supports one-shot analysis; an inspiration tab shows static creative cards and ambient audio.",
        ],
    ),
    (
        "How It Works",
        [
            "Expo Router app is wrapped by QueryClientProvider, SettingsProvider, and VoiceProvider.",
            "CameraView captures base64 frames in navigation and capture screens.",
            "GuideAI calls VisionAI; VisionAI uses @rork-ai/toolkit-sdk generateObject with a Zod schema to structure analysis.",
            "GuideAI smooths the result, then the UI speaks it with expo-speech and reinforces it with expo-haptics.",
            "Local settings are stored in AsyncStorage.",
            "Backend / auth / database / server code: Not found in repo.",
        ],
    ),
]

RIGHT_SECTIONS = [
    (
        "How It Is Now",
        [
            "Best described as a polished prototype, not a launch-ready mobility product.",
            "Strongest path today is the simple accessibility flow (`/`, `/navigation`, `/settings`, `/onboarding`).",
            "Product identity is split: the tabbed capture / inspiration experience reads more like a creative camera concept than assistive navigation.",
        ],
    ),
    (
        "How To Enhance",
        [
            "Short term: keep Expo and tighten the mobility use case before adding more surfaces.",
            "SwiftUI is worth it only if the launch target becomes iOS-first and you need lower-latency camera / audio loops, deeper VoiceOver polish, AVFoundation / Vision hooks, or background behavior that Expo cannot cover cleanly.",
            "If cross-platform remains the goal, add native modules only for the bottlenecks instead of rewriting the full app first.",
        ],
    ),
    (
        "Launch + Real Backend",
        [
            "Move vision calls behind a real backend so API keys are never shipped in-app; add rate limiting, logging, prompt / model versioning, and failure monitoring.",
            "Replace placeholder SOS and mock sensor starters with real services and explicit safety behavior.",
            "Resolve the route split: ship either the accessibility navigator or fold the tabbed capture UI into the same product story.",
            "Add QA on real devices, analytics / crash reporting, privacy copy, and EAS release setup.",
            "User accounts, persistence, offline strategy, and human-support workflows: Not found in repo.",
        ],
    ),
    (
        "How To Run",
        [
            "cd expo",
            "bun install",
            "Create .env with EXPO_PUBLIC_OPENAI_API_KEY and optional EXPO_PUBLIC_OPENAI_MODEL",
            "bun run start for device / simulator, or bun run start-web for browser",
            "For store builds, README points to eas build --platform ios / android",
            "Note: package.json start scripts call bunx rork start ...; a plain expo start script is not found in repo.",
        ],
    ),
]

EVIDENCE = (
    "Evidence: expo/README.md, expo/app.json, expo/package.json, expo/app/_layout.tsx, "
    "expo/src/logic/VisionAI.ts, expo/src/logic/GuideAI.ts, "
    "expo/src/screens/{HomeScreen,NavigationScreen,OnboardingScreen,SettingsScreen}.tsx, "
    "expo/app/(tabs)/{capture,inspiration}.tsx, expo/src/providers/SettingsProvider.tsx."
)


def make_styles():
    navy = HexColor("#0b1224")
    orange = HexColor("#ffb347")
    slate = HexColor("#4b5563")
    body = ParagraphStyle(
        "Body",
        fontName="Helvetica",
        fontSize=9.5,
        leading=11.4,
        textColor=navy,
        spaceAfter=3,
    )
    return {
        "title": ParagraphStyle(
            "Title",
            fontName="Helvetica-Bold",
            fontSize=21,
            leading=23,
            textColor=navy,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            fontName="Helvetica",
            fontSize=9.2,
            leading=11.2,
            textColor=slate,
        ),
        "section": ParagraphStyle(
            "Section",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=12.8,
            textColor=orange,
            spaceBefore=0,
            spaceAfter=4,
        ),
        "body": body,
        "bullet": ParagraphStyle(
            "Bullet",
            parent=body,
            leftIndent=10,
            firstLineIndent=-8,
            spaceAfter=2,
        ),
        "small": ParagraphStyle(
            "Small",
            fontName="Helvetica",
            fontSize=7.8,
            leading=9.2,
            textColor=slate,
        ),
    }


def draw_paragraph(pdf: canvas.Canvas, text: str, style: ParagraphStyle, x: float, y: float, width: float):
    para = Paragraph(text, style)
    _, height = para.wrap(width, y)
    para.drawOn(pdf, x, y - height)
    return y - height


def draw_section(pdf: canvas.Canvas, heading: str, bullets: list[str], x: float, y: float, width: float, styles):
    y = draw_paragraph(pdf, heading, styles["section"], x, y, width)
    for bullet in bullets:
        y -= 1.5
        y = draw_paragraph(pdf, f"- {bullet}", styles["bullet"], x, y, width)
    return y - 5


def render_pdf():
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    PNG_PATH.parent.mkdir(parents=True, exist_ok=True)

    page_width, page_height = letter
    margin = 32
    gap = 20
    header_y = page_height - margin
    content_top = page_height - 92
    col_width = (page_width - (margin * 2) - gap) / 2
    left_x = margin
    right_x = margin + col_width + gap
    styles = make_styles()

    pdf = canvas.Canvas(str(PDF_PATH), pagesize=letter)
    pdf.setTitle("Guide Pup app summary")

    pdf.setFillColor(HexColor("#ffb347"))
    pdf.roundRect(margin, page_height - 22, 94, 6, 3, fill=1, stroke=0)

    title_width = stringWidth(TITLE, "Helvetica-Bold", 21)
    pdf.setFillColor(HexColor("#0b1224"))
    pdf.setFont("Helvetica-Bold", 21)
    pdf.drawString(margin, header_y, TITLE)
    pdf.setStrokeColor(HexColor("#d1d5db"))
    pdf.setLineWidth(1)
    pdf.line(margin, header_y - 6, margin + max(title_width, 180), header_y - 6)

    y = header_y - 18
    y = draw_paragraph(pdf, SUBTITLE, styles["subtitle"], margin, y, page_width - (margin * 2))

    left_y = content_top
    right_y = content_top
    for heading, bullets in LEFT_SECTIONS:
        left_y = draw_section(pdf, heading, bullets, left_x, left_y, col_width, styles)
    for heading, bullets in RIGHT_SECTIONS:
        right_y = draw_section(pdf, heading, bullets, right_x, right_y, col_width, styles)

    footer_y = min(left_y, right_y) - 2
    pdf.setStrokeColor(HexColor("#e5e7eb"))
    pdf.setLineWidth(0.8)
    pdf.line(margin, footer_y + 8, page_width - margin, footer_y + 8)
    draw_paragraph(pdf, EVIDENCE, styles["small"], margin, footer_y, page_width - (margin * 2))

    pdf.save()


def render_preview():
    doc = pdfium.PdfDocument(str(PDF_PATH))
    page = doc[0]
    bitmap = page.render(scale=2.0).to_pil()
    bitmap.save(PNG_PATH)


if __name__ == "__main__":
    render_pdf()
    render_preview()
    print(PDF_PATH)
    print(PNG_PATH)
