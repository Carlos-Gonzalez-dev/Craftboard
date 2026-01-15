<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null
let particles: Particle[] = []

const GRID_SIZE = 40
const PARTICLE_COUNT = 12
const MIN_SPEED = 0.3
const MAX_SPEED = 1.2

interface Particle {
  x: number
  y: number
  direction: 'horizontal' | 'vertical'
  speed: number
  size: number
  opacity: number
  color: string
}

const colors = [
  'rgba(99, 102, 241, 0.6)',   // Indigo
  'rgba(168, 85, 247, 0.6)',   // Purple
  'rgba(139, 92, 246, 0.5)',   // Violet
]

function createParticle(width: number, height: number): Particle {
  const direction = Math.random() > 0.5 ? 'horizontal' : 'vertical'
  const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
  const goingPositive = Math.random() > 0.5

  let x: number, y: number

  if (direction === 'horizontal') {
    // Position on a horizontal grid line
    const lineIndex = Math.floor(Math.random() * (height / GRID_SIZE))
    y = lineIndex * GRID_SIZE
    x = goingPositive ? -10 : width + 10
  } else {
    // Position on a vertical grid line
    const lineIndex = Math.floor(Math.random() * (width / GRID_SIZE))
    x = lineIndex * GRID_SIZE
    y = goingPositive ? -10 : height + 10
  }

  return {
    x,
    y,
    direction,
    speed: goingPositive ? speed : -speed,
    size: 2 + Math.random() * 2,
    opacity: 0.3 + Math.random() * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)] || colors[0],
  }
}

function updateParticle(p: Particle, width: number, height: number): boolean {
  if (p.direction === 'horizontal') {
    p.x += p.speed
    // Check if out of bounds
    if (p.speed > 0 && p.x > width + 20) return false
    if (p.speed < 0 && p.x < -20) return false
  } else {
    p.y += p.speed
    // Check if out of bounds
    if (p.speed > 0 && p.y > height + 20) return false
    if (p.speed < 0 && p.y < -20) return false
  }
  return true
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  const opacityRegex = /[\d.]+\)$/

  // Draw glow
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
  gradient.addColorStop(0, p.color.replace(opacityRegex, p.opacity + ')'))
  gradient.addColorStop(0.5, p.color.replace(opacityRegex, p.opacity * 0.3 + ')'))
  gradient.addColorStop(1, 'transparent')

  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()

  // Draw core
  ctx.beginPath()
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  ctx.fillStyle = p.color.replace(opacityRegex, p.opacity + 0.2 + ')')
  ctx.fill()
}

function animate() {
  if (!ctx || !canvas.value) return

  const width = canvas.value.width
  const height = canvas.value.height

  ctx.clearRect(0, 0, width, height)

  // Update and draw particles
  particles = particles.filter((p) => updateParticle(p, width, height))

  // Add new particles to maintain count
  while (particles.length < PARTICLE_COUNT) {
    particles.push(createParticle(width, height))
  }

  // Draw all particles
  for (const p of particles) {
    drawParticle(ctx, p)
  }

  animationId = requestAnimationFrame(animate)
}

function resizeCanvas() {
  if (!canvas.value) return
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
}

onMounted(() => {
  if (!canvas.value) return

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  ctx = canvas.value.getContext('2d')
  if (!ctx) return

  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  // Initialize particles
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(createParticle(canvas.value.width, canvas.value.height))
  }

  animate()
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <canvas ref="canvas" class="grid-sparkles"></canvas>
</template>

<style scoped>
.grid-sparkles {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}
</style>
