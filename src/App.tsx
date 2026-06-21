import {
  Bell,
  ChevronLeft,
  ChevronRight,
  FileCode2,
  ImageUp,
  Images,
  LayoutDashboard,
  Newspaper,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, FormEvent, PointerEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabaseClient'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cards', label: 'Cards', icon: Images },
  { id: 'posts', label: 'Posts', icon: Newspaper },
] as const
type PageId = (typeof navItems)[number]['id']
const BLACK_THRESHOLD = 30
const WHITE_THRESHOLD = 225
const CLUSTER_COUNT = 5
const MAX_PIXELS = 18000
const MAX_CHROMA = 0.45
const HARMONY_STORAGE_KEY = 'ditara-selected-harmony'
const CARDS_STORAGE_KEY = 'ditara-dashboard-cards'
const PAGE_SIZE = 5
const MAX_IMAGE_DIMENSION = 1200
const THUMBNAIL_IMAGE_DIMENSION = 180
const IMAGE_EXPORT_QUALITY = 0.82
const THUMBNAIL_EXPORT_QUALITY = 0.48
const CARD_WIDTH = 697
const CARD_HEIGHT = 1016
const CARD_RADIUS = 24
const CARD_PHOTO_SIZE = 601
const CARD_PHOTO_X = 48
const CARD_PHOTO_Y = 128
const OBJ_LOGO_PATH = `${import.meta.env.BASE_URL}OBJ.png`
const HEADER_MASK_PATH = `${import.meta.env.BASE_URL}card-header-mask.png`

type RgbColor = {
  r: number
  g: number
  b: number
}

type HueResult = {
  hue: number
  rgb: RgbColor
  imageUrl: string
  imageDataUrl: string
  thumbnailDataUrl: string
  imageWidth: number
  imageHeight: number
}

type OklchColor = {
  l: number
  c: number
  h: number
}

type AccentStyle = CSSProperties & {
  '--accent-rgb'?: string
}

type HarmonyOption = {
  id: string
  name: string
  delta: number
}

type PerceptualHarmonyStyle = CSSProperties & {
  '--harmony-gradient'?: string
}

type CardDraft = {
  name: string
  source: string
  code: string
  description: string
  supertype: Supertype
  subtype: string
  power: number
}

type CardRecord = {
  id: string
  createdAt: string
  updatedAt: string
  result: HueResult
  selectedHarmonyId: string
  draft: CardDraft
  imageTransform: ImageTransform
}

type DeleteTarget = {
  id: string
  name: string
} | null

type PreviewTarget = CardRecord | null

type CardRow = {
  id: string
  payload: CardRecord
  created_at: string
  updated_at: string
}

type ImageTransform = {
  x: number
  y: number
  scale: number
}

type DragState = {
  startX: number
  startY: number
  originX: number
  originY: number
  cardScale: number
}

type CardColors = {
  borderStart: string
  borderEnd: string
  background: string
  imageBorder: string
  footer: string
  text: string
  headerStart: string
  headerEnd: string
}

type Supertype = 'Passive' | 'Active' | 'Realms'

const SUBTYPES: Record<Supertype, string[]> = {
  Passive: ['Terrestrial Planets', 'Gas Giants', 'Moons', 'Small Bodies', 'Instruments'],
  Active: ['Stars', 'Compact Objects', 'Collapse Binaries'],
  Realms: ['Star Systems', 'Clusters', 'Nebulae', 'Galaxies', 'Galactic Nuclei', 'Large Structures'],
}

const DEFAULT_CARD_DRAFT: CardDraft = {
  name: 'Lorem Object',
  source: 'Lorem Observatory',
  code: 'DTR0000001',
  description:
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer orbital data reveals a quiet signal across the deep field.',
  supertype: 'Active',
  subtype: 'Collapse Binaries',
  power: 1,
}

const HARMONY_OPTIONS: HarmonyOption[] = [
  { id: 'complementary-a', name: 'Complementary A', delta: -150 },
  { id: 'complementary-b', name: 'Complementary B', delta: -180 },
  { id: 'complementary-c', name: 'Complementary C', delta: -210 },
  { id: 'analogous-a', name: 'Analogous A', delta: -60 },
  { id: 'analogous-b', name: 'Analogous B', delta: -30 },
  { id: 'analogous-c', name: 'Analogous C', delta: 30 },
  { id: 'analogous-d', name: 'Analogous D', delta: 60 },
  { id: 'monochromatic', name: 'Monochromatic', delta: 0 },
  { id: 'triad-a', name: 'Triad A', delta: -120 },
  { id: 'triad-b', name: 'Triad B', delta: 120 },
  { id: 'square-a', name: 'Square A', delta: -90 },
  { id: 'square-b', name: 'Square B', delta: 90 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360
}

function srgbChannelToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function linearToSrgbChannel(value: number) {
  if (value <= 0.0031308) {
    return 12.92 * value
  }

  return 1.055 * value ** (1 / 2.4) - 0.055
}

function rgbToOklch({ r, g, b }: RgbColor): OklchColor {
  const red = srgbChannelToLinear(r)
  const green = srgbChannelToLinear(g)
  const blue = srgbChannelToLinear(b)

  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  return {
    l: clamp(lightness, 0, 1),
    c: clamp(Math.sqrt(a * a + labB * labB), 0, MAX_CHROMA),
    h: normalizeHue((Math.atan2(labB, a) * 180) / Math.PI),
  }
}

function oklchToLinearSrgb({ l, c, h }: OklchColor) {
  const hue = (normalizeHue(h) * Math.PI) / 180
  const a = Math.cos(hue) * c
  const b = Math.sin(hue) * c
  return oklabToLinearSrgb(l, a, b)
}

function oklabToLinearSrgb(l: number, a: number, b: number) {
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b
  const lCubed = lPrime ** 3
  const mCubed = mPrime ** 3
  const sCubed = sPrime ** 3

  return {
    r: 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    g: -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    b: -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  }
}

function oklchToOklab({ l, c, h }: OklchColor) {
  const hue = (normalizeHue(h) * Math.PI) / 180

  return {
    l,
    a: Math.cos(hue) * c,
    b: Math.sin(hue) * c,
  }
}

function oklabToOklch(l: number, a: number, b: number): OklchColor {
  return {
    l: clamp(l, 0, 1),
    c: clamp(Math.sqrt(a * a + b * b), 0, MAX_CHROMA),
    h: normalizeHue((Math.atan2(b, a) * 180) / Math.PI),
  }
}

function oklchToSrgb(color: OklchColor) {
  const linear = oklchToLinearSrgb(color)

  return {
    r: linearToSrgbChannel(linear.r),
    g: linearToSrgbChannel(linear.g),
    b: linearToSrgbChannel(linear.b),
  }
}

function isInRgbGamut(color: OklchColor) {
  const linear = oklchToLinearSrgb(color)

  return (
    Number.isFinite(linear.r) &&
    Number.isFinite(linear.g) &&
    Number.isFinite(linear.b) &&
    linear.r >= -0.000001 &&
    linear.r <= 1.000001 &&
    linear.g >= -0.000001 &&
    linear.g <= 1.000001 &&
    linear.b >= -0.000001 &&
    linear.b <= 1.000001
  )
}

function fitChromaToRgbGamut(color: OklchColor) {
  if (isInRgbGamut(color)) {
    return color
  }

  let low = 0
  let high = clamp(color.c, 0, MAX_CHROMA)

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2
    if (isInRgbGamut({ ...color, c: mid })) {
      low = mid
    } else {
      high = mid
    }
  }

  return { ...color, c: low }
}

function rgbCssChannels(rgb: RgbColor) {
  return `${Math.round(clamp(rgb.r, 0, 255))} ${Math.round(clamp(rgb.g, 0, 255))} ${Math.round(
    clamp(rgb.b, 0, 255),
  )}`
}

function oklchToRgbCssChannels(color: OklchColor) {
  const rgb = oklchToSrgb(color)

  return rgbCssChannels({
    r: rgb.r * 255,
    g: rgb.g * 255,
    b: rgb.b * 255,
  })
}

function oklchToRgbCss(color: OklchColor) {
  const rgb = oklchToSrgb(color)

  return `rgb(${Math.round(clamp(rgb.r, 0, 1) * 255)}, ${Math.round(
    clamp(rgb.g, 0, 1) * 255,
  )}, ${Math.round(clamp(rgb.b, 0, 1) * 255)})`
}

function safeOklch(l: number, c: number, h: number) {
  return oklchToRgbCss(fitChromaToRgbGamut({ l, c, h: normalizeHue(h) }))
}

function oklabGradientStops(from: OklchColor, to: OklchColor, steps = 28) {
  const fromLab = oklchToOklab(from)
  const toLab = oklchToOklab(to)

  return Array.from({ length: steps + 1 }, (_, index) => {
    const amount = index / steps
    const color = fitChromaToRgbGamut(
      oklabToOklch(
        fromLab.l + (toLab.l - fromLab.l) * amount,
        fromLab.a + (toLab.a - fromLab.a) * amount,
        fromLab.b + (toLab.b - fromLab.b) * amount,
      ),
    )

    return `<stop offset="${(amount * 100).toFixed(3)}%" stop-color="${oklchToRgbCss(color)}" />`
  }).join('')
}

function colorsForCard(hue1: number, hue2: number): CardColors {
  return {
    borderStart: safeOklch(0.5537, 0.204, hue1),
    borderEnd: safeOklch(0.7449, 0.1277, hue2),
    background: safeOklch(0.2158, 0.0264, hue1),
    imageBorder: safeOklch(0.3824, 0.0368, hue1),
    footer: safeOklch(0.6613, 0.026, hue1),
    text: safeOklch(0.9363, 0.0116, hue1),
    headerStart: safeOklch(0.3588, 0.1354, hue1),
    headerEnd: safeOklch(0.346, 0.0543, hue2),
  }
}

const BASE_ACCENT = rgbToOklch({ r: 189, g: 215, b: 156 })

function isIgnoredPixel({ r, g, b }: RgbColor) {
  const isBlackish = r < BLACK_THRESHOLD && g < BLACK_THRESHOLD && b < BLACK_THRESHOLD
  const isWhiteish = r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD
  const isGrayscale = r === g && g === b

  return isBlackish || isWhiteish || isGrayscale
}

function distanceSquared(color: RgbColor, center: RgbColor) {
  return (color.r - center.r) ** 2 + (color.g - center.g) ** 2 + (color.b - center.b) ** 2
}

function getDominantColor(pixels: RgbColor[], k = CLUSTER_COUNT) {
  const clusterCount = Math.min(k, pixels.length)
  let centers = Array.from({ length: clusterCount }, (_, index) => {
    const pixelIndex = Math.floor((index * pixels.length) / clusterCount)
    return { ...pixels[pixelIndex] }
  })
  let labels = new Array<number>(pixels.length).fill(0)

  for (let iteration = 0; iteration < 10; iteration += 1) {
    labels = pixels.map((pixel) => {
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY

      centers.forEach((center, centerIndex) => {
        const distance = distanceSquared(pixel, center)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = centerIndex
        }
      })

      return nearestIndex
    })

    centers = centers.map((center, centerIndex) => {
      const clusterPixels = pixels.filter((_, pixelIndex) => labels[pixelIndex] === centerIndex)
      if (clusterPixels.length === 0) {
        return center
      }

      return clusterPixels.reduce(
        (sum, pixel) => ({
          r: sum.r + pixel.r / clusterPixels.length,
          g: sum.g + pixel.g / clusterPixels.length,
          b: sum.b + pixel.b / clusterPixels.length,
        }),
        { r: 0, g: 0, b: 0 },
      )
    })
  }

  const counts = centers.map((_, centerIndex) => labels.filter((label) => label === centerIndex).length)
  const dominantIndex = counts.indexOf(Math.max(...counts))

  return {
    r: Math.round(centers[dominantIndex].r),
    g: Math.round(centers[dominantIndex].g),
    b: Math.round(centers[dominantIndex].b),
  }
}

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const imageUrl = URL.createObjectURL(file)

    image.onload = () => resolve(image)
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      reject(new Error('Foto tidak bisa dibaca.'))
    }
    image.src = imageUrl
  })
}

function resizeImageToDataUrl(image: HTMLImageElement, maxDimension: number, quality: number) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas tidak tersedia.')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width,
    height,
  }
}

async function analyzeImageHue(file: File): Promise<HueResult> {
  const image = await readImage(file)
  const optimizedImage = resizeImageToDataUrl(image, MAX_IMAGE_DIMENSION, IMAGE_EXPORT_QUALITY)
  const thumbnailImage = resizeImageToDataUrl(image, THUMBNAIL_IMAGE_DIMENSION, THUMBNAIL_EXPORT_QUALITY)
  const analysisScale = Math.min(1, Math.sqrt(MAX_PIXELS / (optimizedImage.width * optimizedImage.height)))
  const width = Math.max(1, Math.round(optimizedImage.width * analysisScale))
  const height = Math.max(1, Math.round(optimizedImage.height * analysisScale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas tidak tersedia.')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height).data
  const validPixels: RgbColor[] = []

  for (let index = 0; index < data.length; index += 4) {
    const pixel = {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    }

    if (!isIgnoredPixel(pixel)) {
      validPixels.push(pixel)
    }
  }

  if (validPixels.length === 0) {
    URL.revokeObjectURL(image.src)
    throw new Error('Tidak ada piksel warna yang bisa dihitung setelah filter hitam, putih, dan abu-abu.')
  }

  const rgb = getDominantColor(validPixels)
  URL.revokeObjectURL(image.src)

  return {
    hue: rgbToOklch(rgb).h,
    rgb,
    imageUrl: optimizedImage.dataUrl,
    imageDataUrl: optimizedImage.dataUrl,
    thumbnailDataUrl: thumbnailImage.dataUrl,
    imageWidth: optimizedImage.width,
    imageHeight: optimizedImage.height,
  }
}

function accentStyleFromHue(hue: number | null): AccentStyle {
  if (hue === null) {
    return {}
  }

  const accent = fitChromaToRgbGamut({
    l: BASE_ACCENT.l,
    c: BASE_ACCENT.c,
    h: hue,
  })

  return {
    '--accent-rgb': oklchToRgbCssChannels(accent),
  }
}

function perceptualHarmonyGradient(hue1: number, hue2: number) {
  return `linear-gradient(135deg in oklab, oklch(0.5537 0.204 ${hue1.toFixed(
    2,
  )}), oklch(0.7449 0.1277 ${hue2.toFixed(2)}))`
}

function harmonyStyle(hue1: number, option: HarmonyOption): PerceptualHarmonyStyle {
  const hue2 = normalizeHue(hue1 + option.delta)

  return {
    '--harmony-gradient': perceptualHarmonyGradient(normalizeHue(hue1), hue2),
  }
}

function storedHarmonyId() {
  const storedId = window.localStorage.getItem(HARMONY_STORAGE_KEY)
  return HARMONY_OPTIONS.some((option) => option.id === storedId) ? storedId : null
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function fetchAssetDataUrl(path: string) {
  const response = await fetch(path)
  const blob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Asset tidak bisa dibaca.'))
    reader.readAsDataURL(blob)
  })
}

function getSelectedHarmony(selectedHarmonyId: string | null) {
  return HARMONY_OPTIONS.find((option) => option.id === selectedHarmonyId) ?? null
}

function wrapText(value: string, maxChars: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (nextLine.length > maxChars && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = nextLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.slice(0, 5)
}

function titleLengthAttributes(title: string) {
  const approximateWidth = title.length * 27
  return approximateWidth > 483 ? ' textLength="483" lengthAdjust="spacingAndGlyphs"' : ''
}

function sourceLengthAttributes(source: string, code: string) {
  const availableWidth = Math.max(260, 560 - code.length * 11)
  const approximateWidth = source.length * 10

  return approximateWidth > availableWidth
    ? ` textLength="${availableWidth}" lengthAdjust="spacingAndGlyphs"`
    : ''
}

function roundedStarPath(cx: number, cy: number, outerRadius: number, innerRadius: number) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    const angle = (-90 + index * 36) * (Math.PI / 180)

    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    }
  })

  return points
    .map((point, index) => {
      const previous = points[(index + points.length - 1) % points.length]
      const next = points[(index + 1) % points.length]
      const smoothing = index % 2 === 0 ? 0.22 : 0.16
      const start = {
        x: point.x + (previous.x - point.x) * smoothing,
        y: point.y + (previous.y - point.y) * smoothing,
      }
      const end = {
        x: point.x + (next.x - point.x) * smoothing,
        y: point.y + (next.y - point.y) * smoothing,
      }

      return `${index === 0 ? `M${start.x.toFixed(2)} ${start.y.toFixed(2)}` : `L${start.x.toFixed(2)} ${start.y.toFixed(2)}`} Q${point.x.toFixed(
        2,
      )} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
    })
    .join(' ')
    .concat(' Z')
}

function imagePlacement(result: HueResult, transform: ImageTransform) {
  const coverScale = Math.max(CARD_PHOTO_SIZE / result.imageWidth, CARD_PHOTO_SIZE / result.imageHeight)
  const width = result.imageWidth * coverScale * transform.scale
  const height = result.imageHeight * coverScale * transform.scale

  return {
    x: CARD_PHOTO_X + (CARD_PHOTO_SIZE - width) / 2 + transform.x,
    y: CARD_PHOTO_Y + (CARD_PHOTO_SIZE - height) / 2 + transform.y,
    width,
    height,
  }
}

function buildCardSvg(
  result: HueResult,
  selectedHarmony: HarmonyOption,
  draft: CardDraft,
  transform: ImageTransform,
  objectLogoDataUrl: string,
  headerMaskDataUrl: string,
) {
  const hue1 = normalizeHue(result.hue)
  const hue2 = normalizeHue(result.hue + selectedHarmony.delta)
  const colors = colorsForCard(hue1, hue2)
  const borderStops = oklabGradientStops(
    { l: 0.5537, c: 0.204, h: hue1 },
    { l: 0.7449, c: 0.1277, h: hue2 },
  )
  const headerStops = oklabGradientStops(
    { l: 0.3588, c: 0.1354, h: hue1 },
    { l: 0.346, c: 0.0543, h: hue2 },
  )
  const image = imagePlacement(result, transform)
  const objectName = draft.name
  const typeText = `${draft.supertype} • ${draft.subtype}`.toUpperCase()
  const titleAttributes = titleLengthAttributes(objectName)
  const sourceAttributes = sourceLengthAttributes(draft.source, draft.code)
  const descriptionLines = wrapText(draft.description, 51)
  const stars = Array.from({ length: 5 }, (_, index) => {
    const opacity = index < draft.power ? 1 : 0.3
    return `<path d="${roundedStarPath(164 + index * 29, 793, 14, 6.6)}" fill="${colors.text}" opacity="${opacity}" />`
  }).join('')
  const description = descriptionLines
    .map((line, index) => {
      const y = 842 + index * 29
      return `<text x="48" y="${y}" fill="${colors.text}" font-size="24" font-weight="300">${escapeXml(line)}</text>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="cardBorder" gradientUnits="userSpaceOnUse" x1="0" y1="147" x2="697" y2="870">
      ${borderStops}
    </linearGradient>
    <linearGradient id="headerGradient" gradientUnits="userSpaceOnUse" x1="24" y1="64" x2="555" y2="64">
      ${headerStops}
    </linearGradient>
    <mask id="headerMask" maskUnits="userSpaceOnUse" x="24" y="24" width="552" height="101" style="mask-type: alpha;">
      <image href="${headerMaskDataUrl}" x="24" y="24" width="552" height="101" preserveAspectRatio="none" />
    </mask>
    <clipPath id="cardClip"><rect width="697" height="1016" rx="${CARD_RADIUS}" /></clipPath>
    <clipPath id="photoClip"><rect x="48" y="128" width="601" height="601" rx="16" /></clipPath>
    <filter id="paperNoise" x="24" y="24" width="649" height="968" filterUnits="userSpaceOnUse">
      <feTurbulence type="fractalNoise" baseFrequency="0.84" numOctaves="1" seed="7" result="noise" />
      <feColorMatrix in="noise" type="saturate" values="0" result="monoNoise" />
      <feBlend in="SourceGraphic" in2="monoNoise" mode="multiply" />
    </filter>
  </defs>
  <g clip-path="url(#cardClip)">
    <rect width="697" height="1016" fill="url(#cardBorder)" />
    <rect x="24" y="24" width="649" height="968" rx="${CARD_RADIUS}" fill="${colors.background}" opacity="0.96" />
    <rect x="24" y="24" width="649" height="968" rx="${CARD_RADIUS}" fill="${colors.background}" filter="url(#paperNoise)" opacity="0.02" style="mix-blend-mode:multiply" />
    <rect x="24" y="24" width="552" height="101" fill="url(#headerGradient)" mask="url(#headerMask)" />
    <text x="46" y="80" fill="${colors.text}" font-family="'Work Sans', Arial, sans-serif" font-size="43" font-weight="600" letter-spacing=".5"${titleAttributes}>${escapeXml(
      objectName,
    )}</text>
    <image href="${objectLogoDataUrl}" x="577" y="47" width="76" height="38" preserveAspectRatio="xMidYMid meet" />
    <g clip-path="url(#photoClip)">
      <image href="${result.imageDataUrl}" x="${image.x.toFixed(2)}" y="${image.y.toFixed(2)}" width="${image.width.toFixed(
        2,
      )}" height="${image.height.toFixed(2)}" preserveAspectRatio="none" />
    </g>
    <rect x="48" y="128" width="601" height="601" rx="16" fill="none" stroke="${colors.imageBorder}" stroke-width="7" />
    <text x="48" y="770" fill="${colors.text}" font-family="'Work Sans', Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(
      typeText,
    )}</text>
    <text x="48" y="805" fill="${colors.text}" font-family="'Work Sans', Arial, sans-serif" font-size="24" font-weight="700">POWER:</text>
    <g>${stars}</g>
    <g font-family="'Work Sans', Arial, sans-serif">${description}</g>
    <text x="48" y="967" fill="${colors.footer}" font-family="'Work Sans', Arial, sans-serif" font-size="18" font-weight="700"${sourceAttributes}>${escapeXml(
      draft.source,
    )}</text>
    <text x="649" y="967" text-anchor="end" fill="${colors.footer}" font-family="'Work Sans', Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(
      draft.code,
    )}</text>
  </g>
</svg>`
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `card-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function rgbFromHue(hue: number): RgbColor {
  const rgb = oklchToSrgb(
    fitChromaToRgbGamut({
      l: BASE_ACCENT.l,
      c: BASE_ACCENT.c,
      h: normalizeHue(hue),
    }),
  )

  return {
    r: Math.round(clamp(rgb.r, 0, 1) * 255),
    g: Math.round(clamp(rgb.g, 0, 1) * 255),
    b: Math.round(clamp(rgb.b, 0, 1) * 255),
  }
}

function loadStoredCards(): CardRecord[] {
  try {
    const stored = window.localStorage.getItem(CARDS_STORAGE_KEY)
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored) as CardRecord[]
    return Array.isArray(parsed)
      ? parsed.map((card) => ({
          ...card,
          result: {
            ...card.result,
            imageUrl: card.result.imageUrl || card.result.imageDataUrl,
            thumbnailDataUrl: card.result.thumbnailDataUrl || card.result.imageDataUrl,
          },
        }))
      : []
  } catch {
    return []
  }
}

function pageFromPathname(pathname: string): PageId {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const relativePath = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname
  const firstSegment = relativePath.split('/').filter(Boolean)[0]

  if (firstSegment === 'posts') {
    return 'posts'
  }

  if (firstSegment === 'cards') {
    return 'cards'
  }

  return 'overview'
}

function initialPageFromLocation(): PageId {
  const redirectPath = new URLSearchParams(window.location.search).get('p')
  if (!redirectPath) {
    return pageFromPathname(window.location.pathname)
  }

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const page = pageFromPathname(`${basePath}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}`)
  window.history.replaceState(null, '', pagePath(page))

  return page
}

function pagePath(pageId: PageId) {
  if (pageId === 'overview') {
    return import.meta.env.BASE_URL
  }

  return `${import.meta.env.BASE_URL}${pageId}`
}

async function svgToPngBlob(svg: string) {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  const image = new Image()

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Kartu gagal dirender ke PNG.'))
    image.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT

  if (!context) {
    URL.revokeObjectURL(svgUrl)
    return null
  }

  context.drawImage(image, 0, 0)
  URL.revokeObjectURL(svgUrl)

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export function App() {
  const [result, setResult] = useState<HueResult | null>(null)
  const [error, setError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedHarmonyId, setSelectedHarmonyId] = useState<string | null>(
    () => storedHarmonyId() ?? 'monochromatic',
  )
  const [activePage, setActivePage] = useState<PageId>(initialPageFromLocation)
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [cards, setCards] = useState<CardRecord[]>(() => (isSupabaseConfigured ? [] : loadStoredCards()))
  const [isCardsLoading, setIsCardsLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [cardPage, setCardPage] = useState(1)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>(null)
  const [cardDraft, setCardDraft] = useState<CardDraft>(DEFAULT_CARD_DRAFT)
  const [imageTransform, setImageTransform] = useState<ImageTransform>({ x: 0, y: 0, scale: 1 })
  const [objectLogoDataUrl, setObjectLogoDataUrl] = useState('')
  const [headerMaskDataUrl, setHeaderMaskDataUrl] = useState('')
  const previewStageRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const accentStyle = accentStyleFromHue(result?.hue ?? null)
  const selectedHarmony = getSelectedHarmony(selectedHarmonyId)
  const totalCardPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE))
  const safeCardPage = Math.min(cardPage, totalCardPages)
  const visibleCards = cards.slice((safeCardPage - 1) * PAGE_SIZE, safeCardPage * PAGE_SIZE)
  const cardSvg =
    result && selectedHarmony
      ? buildCardSvg(
          result,
          selectedHarmony,
          cardDraft,
          imageTransform,
          objectLogoDataUrl || OBJ_LOGO_PATH,
          headerMaskDataUrl || HEADER_MASK_PATH,
        )
      : ''
  const cardSvgDataUrl = useMemo(
    () => (cardSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg)}` : ''),
    [cardSvg],
  )

  useEffect(() => {
    if (!isSupabaseConfigured) {
      window.localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards))
    }
  }, [cards])

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsAuthReady(true)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsAuthReady(true)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !session) {
      return
    }

    const client = supabase
    let isMounted = true

    async function loadCards() {
      setIsCardsLoading(true)
      setDataError('')

      const { data, error } = await client
        .from('cards')
        .select('id,payload,created_at,updated_at')
        .order('updated_at', { ascending: false })

      if (!isMounted) {
        return
      }

      if (error) {
        setDataError(error.message)
        setCards([])
      } else {
        setCards(
          ((data ?? []) as CardRow[]).map((row) => ({
            ...row.payload,
            id: row.id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            result: {
              ...row.payload.result,
              imageUrl: row.payload.result.imageUrl || row.payload.result.imageDataUrl,
              thumbnailDataUrl: row.payload.result.thumbnailDataUrl || row.payload.result.imageDataUrl,
            },
          })),
        )
      }
      setIsCardsLoading(false)
    }

    void loadCards()

    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromPathname(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    fetchAssetDataUrl(OBJ_LOGO_PATH)
      .then(setObjectLogoDataUrl)
      .catch(() => setObjectLogoDataUrl(OBJ_LOGO_PATH))
    fetchAssetDataUrl(HEADER_MASK_PATH)
      .then(setHeaderMaskDataUrl)
      .catch(() => setHeaderMaskDataUrl(HEADER_MASK_PATH))
  }, [])

  function navigateTo(pageId: PageId) {
    const nextPath = pagePath(pageId)
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
    setActivePage(pageId)
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      return
    }

    setIsAuthBusy(true)
    setAuthError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      setAuthError(error.message)
    } else {
      setAuthPassword('')
    }

    setIsAuthBusy(false)
  }

  async function handleSignOut() {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
    setCards([])
  }

  function resetWizard() {
    setResult(null)
    setError('')
    setIsAnalyzing(false)
    setSelectedHarmonyId(storedHarmonyId() ?? 'monochromatic')
    setCardDraft(DEFAULT_CARD_DRAFT)
    setImageTransform({ x: 0, y: 0, scale: 1 })
    setEditingCardId(null)
    setWizardStep(1)
  }

  function openCreateWizard() {
    resetWizard()
    setIsWizardOpen(true)
  }

  function openEditWizard(card: CardRecord) {
    setResult({
      ...card.result,
      imageUrl: card.result.imageUrl || card.result.imageDataUrl,
    })
    setSelectedHarmonyId(card.selectedHarmonyId)
    setCardDraft(card.draft)
    setImageTransform(card.imageTransform)
    setEditingCardId(card.id)
    setError('')
    setWizardStep(1)
    setIsWizardOpen(true)
  }

  function closeWizard() {
    setIsWizardOpen(false)
  }

  function selectHarmony(optionId: string) {
    setSelectedHarmonyId(optionId)
    window.localStorage.setItem(HARMONY_STORAGE_KEY, optionId)
  }

  function updateHue(hue: number) {
    setResult((current) =>
      current
        ? {
            ...current,
            hue: normalizeHue(hue),
            rgb: rgbFromHue(hue),
          }
        : current,
    )
  }

  function updateCardDraft<T extends keyof CardDraft>(key: T, value: CardDraft[T]) {
    setCardDraft((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateSupertype(supertype: Supertype) {
    setCardDraft((current) => ({
      ...current,
      supertype,
      subtype: SUBTYPES[supertype][0],
    }))
  }

  function handlePhotoDragStart(event: PointerEvent<HTMLDivElement>) {
    const stage = previewStageRef.current
    if (!stage) {
      return
    }

    const rect = stage.getBoundingClientRect()
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: imageTransform.x,
      originY: imageTransform.y,
      cardScale: rect.width / CARD_WIDTH,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePhotoDragMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }

    setImageTransform((current) => ({
      ...current,
      x: dragState.originX + (event.clientX - dragState.startX) / dragState.cardScale,
      y: dragState.originY + (event.clientY - dragState.startY) / dragState.cardScale,
    }))
  }

  function handlePhotoDragEnd() {
    dragStateRef.current = null
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsAnalyzing(true)
    setError('')

    try {
      if (result?.imageUrl) {
        URL.revokeObjectURL(result.imageUrl)
      }

      setResult(await analyzeImageHue(file))
      setImageTransform({ x: 0, y: 0, scale: 1 })
    } catch (analysisError) {
      setResult(null)
      setError(analysisError instanceof Error ? analysisError.message : 'Foto gagal dianalisis.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function buildSvgForCard(card: CardRecord) {
    const harmony = getSelectedHarmony(card.selectedHarmonyId) ?? HARMONY_OPTIONS[7]
    return buildCardSvg(
      {
        ...card.result,
        imageUrl: card.result.imageUrl || card.result.imageDataUrl,
      },
      harmony,
      card.draft,
      card.imageTransform,
      objectLogoDataUrl || OBJ_LOGO_PATH,
      headerMaskDataUrl || HEADER_MASK_PATH,
    )
  }

  function buildThumbnailSvgForCard(card: CardRecord) {
    return buildSvgForCard({
      ...card,
      result: {
        ...card.result,
        imageDataUrl: card.result.thumbnailDataUrl || card.result.imageDataUrl,
      },
    })
  }

  function exportCardSvg(card: CardRecord) {
    downloadBlob(
      new Blob([buildSvgForCard(card)], { type: 'image/svg+xml;charset=utf-8' }),
      `${card.draft.code || 'ditara-card'}.svg`,
    )
  }

  async function exportCardPng(card: CardRecord) {
    const blob = await svgToPngBlob(buildSvgForCard(card))
    if (blob) {
      downloadBlob(blob, `${card.draft.code || 'ditara-card'}.png`)
    }
  }

  function exportDraftSvg() {
    if (!cardSvg) {
      return
    }

    downloadBlob(new Blob([cardSvg], { type: 'image/svg+xml;charset=utf-8' }), `${cardDraft.code || 'ditara-card'}.svg`)
  }

  async function exportDraftPng() {
    if (!cardSvg) {
      return
    }

    const blob = await svgToPngBlob(cardSvg)
    if (blob) {
      downloadBlob(blob, `${cardDraft.code || 'ditara-card'}.png`)
    }
  }

  async function saveCard() {
    if (!result || !selectedHarmony) {
      return
    }

    const now = new Date().toISOString()
    const normalizedResult = {
      ...result,
      imageUrl: result.imageDataUrl,
    }

    const existing = cards.find((card) => card.id === editingCardId)
    const record: CardRecord = {
      id: editingCardId ?? makeId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      result: normalizedResult,
      selectedHarmonyId: selectedHarmony.id,
      draft: cardDraft,
      imageTransform,
    }

    if (supabase && session) {
      setDataError('')
      const { error: saveError } = editingCardId
        ? await supabase.from('cards').update({ payload: record, updated_at: now }).eq('id', record.id)
        : await supabase.from('cards').insert({
            id: record.id,
            user_id: session.user.id,
            payload: record,
            created_at: record.createdAt,
            updated_at: record.updatedAt,
          })

      if (saveError) {
        setDataError(saveError.message)
        return
      }
    }

    setCards((current) => {
      if (editingCardId) {
        return current.map((card) => (card.id === editingCardId ? record : card))
      }

      return [record, ...current]
    })

    navigateTo('cards')
    setCardPage(1)
    setIsWizardOpen(false)
  }

  async function deleteCard(cardId: string) {
    if (supabase && session) {
      setDataError('')
      const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
      if (deleteError) {
        setDataError(deleteError.message)
        return
      }
    }

    setCards((current) => current.filter((card) => card.id !== cardId))
    setDeleteTarget(null)
    setPreviewTarget((current) => (current?.id === cardId ? null : current))
  }

  function renderOverview() {
    return (
      <section className="placeholder-page">
        <div>
          <span>Overview</span>
          <h2>Ringkasan dashboard disiapkan di sini.</h2>
          <p>Area ini sengaja dikosongkan dulu untuk dummy state sebelum metrik Ditara dimasukkan.</p>
        </div>
      </section>
    )
  }

  function renderPosts() {
    return (
      <section className="placeholder-page">
        <div>
          <span>Posts</span>
          <h2>Belum ada post workflow.</h2>
          <p>Tab ini sudah tersedia sebagai ruang berikutnya setelah card generator selesai dirapikan.</p>
        </div>
      </section>
    )
  }

  function renderLogin() {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={handleSignIn}>
          <div className="brand login-brand">
            <ShieldCheck size={24} />
            <span>Ditara</span>
          </div>
          <div>
            <span>Secure dashboard</span>
            <h1>Login</h1>
            <p>Masuk untuk mengelola Cards dan Posts dari database Supabase.</p>
          </div>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setAuthEmail(event.target.value)}
              required
              type="email"
              value={authEmail}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setAuthPassword(event.target.value)}
              required
              type="password"
              value={authPassword}
            />
          </label>
          {authError && <p className="error-text">{authError}</p>}
          <button className="primary-action" disabled={isAuthBusy} type="submit">
            {isAuthBusy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    )
  }

  function renderCards() {
    return (
      <section className="cards-page" aria-label="Cards CRUD table">
        <div className="page-heading">
          <div>
            <span>Card generator</span>
            <h2>Cards</h2>
          </div>
          <button className="primary-action page-action" onClick={openCreateWizard} type="button">
            <Plus size={18} />
            Create
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="local-mode-banner">
            Local mode: data masih disimpan di browser. Isi Supabase env untuk mengaktifkan login dan database.
          </div>
        )}
        {isCardsLoading && <div className="local-mode-banner">Loading cards from database...</div>}
        {dataError && <div className="error-banner">{dataError}</div>}

        <div className="cards-table-wrap">
          <table className="cards-table">
            <thead>
              <tr>
                <th>Thumbnail</th>
                <th>Card</th>
                <th>Harmony</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCards.length === 0 ? (
                <tr>
                  <td className="empty-table" colSpan={5}>
                    Belum ada kartu. Klik Create untuk membuat kartu pertama.
                  </td>
                </tr>
              ) : (
                visibleCards.map((card) => {
                  const harmony = getSelectedHarmony(card.selectedHarmonyId)
                  const thumbnailSvg = buildThumbnailSvgForCard(card)
                  const thumbnailUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(thumbnailSvg)}`

                  return (
                    <tr key={card.id}>
                      <td>
                        <button
                          aria-label={`Preview ${card.draft.name}`}
                          className="thumbnail-button"
                          onClick={() => setPreviewTarget(card)}
                          type="button"
                        >
                          <img className="card-thumbnail" alt={`Thumbnail ${card.draft.name}`} src={thumbnailUrl} />
                        </button>
                      </td>
                      <td>
                        <div className="card-title-cell">
                          <strong>{card.draft.name}</strong>
                          <span>
                            {card.draft.code} · {card.draft.supertype}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="table-pill">{harmony?.name ?? 'Custom'}</span>
                      </td>
                      <td>{new Date(card.updatedAt).toLocaleDateString('id-ID')}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label="Edit card"
                            data-tooltip="Edit"
                            onClick={() => openEditWizard(card)}
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            aria-label="Save PNG"
                            data-tooltip="Save PNG"
                            onClick={() => void exportCardPng(card)}
                            type="button"
                          >
                            <Images size={16} />
                          </button>
                          <button
                            aria-label="Save SVG"
                            data-tooltip="Save SVG"
                            onClick={() => exportCardSvg(card)}
                            type="button"
                          >
                            <FileCode2 size={16} />
                          </button>
                          <button
                            aria-label="Delete card"
                            className="danger-action"
                            data-tooltip="Delete"
                            onClick={() => setDeleteTarget({ id: card.id, name: card.draft.name })}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span>
            Page {safeCardPage} of {totalCardPages}
          </span>
          <div>
            <button disabled={safeCardPage === 1} onClick={() => setCardPage((page) => page - 1)} type="button">
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={safeCardPage === totalCardPages}
              onClick={() => setCardPage((page) => page + 1)}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {deleteTarget && (
          <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Konfirmasi hapus kartu">
            <div className="confirm-dialog">
              <div>
                <span>Delete card</span>
                <h3>Hapus {deleteTarget.name}?</h3>
                <p>Kartu akan dihapus dari tabel dan local storage dashboard.</p>
              </div>
              <div className="confirm-actions">
                <button onClick={() => setDeleteTarget(null)} type="button">
                  Cancel
                </button>
                <button className="danger-confirm" onClick={() => void deleteCard(deleteTarget.id)} type="button">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {previewTarget && (
          <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Preview kartu">
            <div className="preview-dialog">
              <header className="preview-header">
                <div>
                  <span>Card preview</span>
                  <h3>{previewTarget.draft.name}</h3>
                </div>
                <button
                  aria-label="Close preview"
                  className="icon-button"
                  onClick={() => setPreviewTarget(null)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="preview-card-frame">
                <img
                  alt={`Preview ${previewTarget.draft.name}`}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSvgForCard(previewTarget))}`}
                />
              </div>
              <footer className="preview-actions">
                <button onClick={() => void exportCardPng(previewTarget)} type="button">
                  <Images size={16} />
                  Save PNG
                </button>
                <button onClick={() => exportCardSvg(previewTarget)} type="button">
                  <FileCode2 size={16} />
                  Save SVG
                </button>
              </footer>
            </div>
          </div>
        )}
      </section>
    )
  }

  function renderWizard() {
    if (!isWizardOpen) {
      return null
    }

    const canGoNext = wizardStep === 1 ? Boolean(result) : wizardStep === 2 ? Boolean(result && selectedHarmony) : true
    const hue2 = result && selectedHarmony ? normalizeHue(result.hue + selectedHarmony.delta) : null

    return (
      <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Card wizard">
        <div className="wizard-shell">
          <header className="wizard-header">
            <div>
              <span>{editingCardId ? 'Edit card' : 'Create card'}</span>
              <h2>{wizardStep === 1 ? 'Upload foto' : wizardStep === 2 ? 'Pilih harmony' : 'Bikin kartu'}</h2>
            </div>
            <button aria-label="Close wizard" className="icon-button" onClick={closeWizard} type="button">
              <X size={18} />
            </button>
          </header>

          <div className="wizard-steps" aria-label="Wizard steps">
            {[1, 2, 3].map((step) => (
              <button
                className={wizardStep === step ? 'active' : ''}
                disabled={step > 1 && !result}
                key={step}
                onClick={() => setWizardStep(step)}
                type="button"
              >
                <span>{step}</span>
                {step === 1 ? 'Foto' : step === 2 ? 'Harmony' : 'Kartu'}
              </button>
            ))}
          </div>

          <section className="wizard-body">
            {wizardStep === 1 && (
              <div className="wizard-grid two-column">
                <label className="photo-input large">
                  <ImageUp size={34} strokeWidth={1.7} />
                  <span>Upload foto</span>
                  <small>Foto ini akan dianalisis untuk hue utama dan bisa diganti kapan saja.</small>
                  <input accept="image/*" type="file" onChange={handlePhotoChange} />
                </label>

                <div className="wizard-panel">
                  {isAnalyzing && <p>Menghitung hue...</p>}
                  {error && <p className="error-text">{error}</p>}
                  {!isAnalyzing && !error && !result && <p>Belum ada foto yang dipilih.</p>}
                  {result && (
                    <div className="selected-photo-summary">
                      <img alt="Foto kartu" src={result.imageUrl} />
                      <div>
                        <span>Hue terdeteksi</span>
                        <strong>{Math.round(result.hue)} deg</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 2 && result && (
              <div className="wizard-grid harmony-layout">
                <div className="wizard-panel color-panel">
                  <img alt="Foto terpilih" src={result.imageUrl} />
                  <div
                    aria-label="Warna utama"
                    className="dominant-swatch compact"
                    style={{ backgroundColor: `rgb(${result.rgb.r}, ${result.rgb.g}, ${result.rgb.b})` }}
                  />
                  <label>
                    <span>Hue utama</span>
                    <input
                      max={359}
                      min={0}
                      onChange={(event) => updateHue(Number(event.target.value))}
                      type="range"
                      value={Math.round(result.hue)}
                    />
                  </label>
                  <label>
                    <span>Hue 1</span>
                    <input
                      max={359}
                      min={0}
                      onChange={(event) => updateHue(Number(event.target.value))}
                      type="number"
                      value={Math.round(result.hue)}
                    />
                  </label>
                  {hue2 !== null && (
                    <small>
                      Hue 2 aktif: <strong>{Math.round(hue2)} deg</strong>
                    </small>
                  )}
                </div>

                <section className="harmony-section in-wizard" aria-label="Perceptual color harmony options">
                  <div className="harmony-heading">
                    <span>OKLab duotone harmony</span>
                    <strong>Pilih color harmony</strong>
                  </div>

                  <div className="harmony-grid">
                    {HARMONY_OPTIONS.map((option) => {
                      const nextHue2 = normalizeHue(result.hue + option.delta)
                      const isSelected = selectedHarmonyId === option.id

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={isSelected ? 'harmony-card selected' : 'harmony-card'}
                          key={option.id}
                          onClick={() => selectHarmony(option.id)}
                          style={harmonyStyle(result.hue, option)}
                          type="button"
                        >
                          <span className="harmony-gradient" />
                          <span className="harmony-copy">
                            <strong>{option.name}</strong>
                            <small>Hue 2: {Math.round(nextHue2)} deg</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}

            {wizardStep === 3 && result && selectedHarmony && (
              <div className="card-generator in-wizard" aria-label="TCG card generator">
                <div className="card-controls">
                  <div className="form-grid">
                    <label>
                      <span>Nama kartu</span>
                      <input onChange={(event) => updateCardDraft('name', event.target.value)} value={cardDraft.name} />
                    </label>

                    <label>
                      <span>Kode kartu</span>
                      <input
                        maxLength={16}
                        onChange={(event) => updateCardDraft('code', event.target.value)}
                        value={cardDraft.code}
                      />
                    </label>

                    <label>
                      <span>Sumber gambar</span>
                      <input
                        onChange={(event) => updateCardDraft('source', event.target.value)}
                        value={cardDraft.source}
                      />
                    </label>

                    <label>
                      <span>Power</span>
                      <select
                        onChange={(event) => updateCardDraft('power', Number(event.target.value))}
                        value={cardDraft.power}
                      >
                        {[1, 2, 3, 4, 5].map((power) => (
                          <option key={power} value={power}>
                            {power}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Supertype</span>
                      <select
                        onChange={(event) => updateSupertype(event.target.value as Supertype)}
                        value={cardDraft.supertype}
                      >
                        {Object.keys(SUBTYPES).map((supertype) => (
                          <option key={supertype} value={supertype}>
                            {supertype}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>Subtype</span>
                      <select
                        onChange={(event) => updateCardDraft('subtype', event.target.value)}
                        value={cardDraft.subtype}
                      >
                        {SUBTYPES[cardDraft.supertype].map((subtype) => (
                          <option key={subtype} value={subtype}>
                            {subtype}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="description-field">
                    <span>Deskripsi kartu</span>
                    <textarea
                      maxLength={150}
                      onChange={(event) => updateCardDraft('description', event.target.value)}
                      rows={4}
                      value={cardDraft.description}
                    />
                    <small>{cardDraft.description.length}/150</small>
                  </label>

                  <div className="image-controls">
                    <label>
                      <span>Foto scale</span>
                      <input
                        max={2.4}
                        min={1}
                        onChange={(event) =>
                          setImageTransform((current) => ({ ...current, scale: Number(event.target.value) }))
                        }
                        step={0.01}
                        type="range"
                        value={imageTransform.scale}
                      />
                    </label>
                    <label>
                      <span>Foto X</span>
                      <input
                        max={260}
                        min={-260}
                        onChange={(event) =>
                          setImageTransform((current) => ({ ...current, x: Number(event.target.value) }))
                        }
                        step={1}
                        type="range"
                        value={imageTransform.x}
                      />
                    </label>
                    <label>
                      <span>Foto Y</span>
                      <input
                        max={260}
                        min={-260}
                        onChange={(event) =>
                          setImageTransform((current) => ({ ...current, y: Number(event.target.value) }))
                        }
                        step={1}
                        type="range"
                        value={imageTransform.y}
                      />
                    </label>
                    <button
                      className="reset-image-button"
                      onClick={() => setImageTransform({ x: 0, y: 0, scale: 1 })}
                      type="button"
                    >
                      Reset photo fit
                    </button>
                  </div>
                </div>

                <div className="card-preview-area">
                  <div className="card-preview-stage" ref={previewStageRef}>
                    <img alt="Generated TCG card preview" src={cardSvgDataUrl} />
                    <div
                      aria-label="Geser foto utama"
                      className="photo-drag-target"
                      onPointerDown={handlePhotoDragStart}
                      onPointerMove={handlePhotoDragMove}
                      onPointerUp={handlePhotoDragEnd}
                      onPointerCancel={handlePhotoDragEnd}
                      role="button"
                      tabIndex={0}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          <footer className="wizard-footer">
            <button disabled={wizardStep === 1} onClick={() => setWizardStep((step) => step - 1)} type="button">
              <ChevronLeft size={16} />
              Back
            </button>
            <div className="wizard-footer-actions">
              {wizardStep === 3 && (
                <>
                  <button disabled={!cardSvg} onClick={() => void exportDraftPng()} type="button">
                    <Images size={16} />
                    Save as PNG
                  </button>
                  <button disabled={!cardSvg} onClick={exportDraftSvg} type="button">
                    <FileCode2 size={16} />
                    Save as SVG
                  </button>
                </>
              )}
              {wizardStep < 3 ? (
                <button
                  className="primary-action"
                  disabled={!canGoNext}
                  onClick={() => setWizardStep((step) => step + 1)}
                  type="button"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="primary-action" onClick={() => void saveCard()} type="button">
                  Save
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    )
  }

  if (isSupabaseConfigured && !isAuthReady) {
    return (
      <main className="login-shell">
        <div className="login-panel">
          <div className="brand login-brand">
            <ShieldCheck size={24} />
            <span>Ditara</span>
          </div>
          <p>Loading secure session...</p>
        </div>
      </main>
    )
  }

  if (isSupabaseConfigured && !session) {
    return renderLogin()
  }

  return (
    <main className="dashboard-shell" style={accentStyle}>
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={24} />
          <span>Ditara</span>
        </div>
        <nav aria-label="Superadmin navigation">
          {navItems.map((item) => (
            <button
              className={activePage === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => navigateTo(item.id)}
              type="button"
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span>Superadmin</span>
            <h1>{navItems.find((item) => item.id === activePage)?.label ?? 'Ditara Dashboard'}</h1>
          </div>
          <div className="toolbar" aria-label="Dashboard tools">
            <button type="button" aria-label="Search">
              <Search size={18} />
            </button>
            <button type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button type="button" aria-label="Settings">
              <Settings size={18} />
            </button>
            {isSupabaseConfigured && (
              <button className="sign-out-button" onClick={() => void handleSignOut()} type="button">
                Sign out
              </button>
            )}
          </div>
        </header>

        <section className="content-workspace">
          {activePage === 'overview' && renderOverview()}
          {activePage === 'cards' && renderCards()}
          {activePage === 'posts' && renderPosts()}
        </section>
      </section>
      {renderWizard()}
    </main>
  )
}

