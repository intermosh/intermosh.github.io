/**
 * Carousel Module
 * Handles commercial works carousel with touch/swipe support
 * © Intermosh 2025
 */

export class Carousel {
    constructor(options = {}) {
        this.track = document.querySelector(options.trackSelector || '.commercial-track');
        this.slides = document.querySelectorAll(options.slideSelector || '.commercial-slide');
        this.prevBtn = document.getElementById(options.prevBtnId || 'prevBtn');
        this.nextBtn = document.getElementById(options.nextBtnId || 'nextBtn');
        this.dotsContainer = document.getElementById(options.dotsContainerId || 'carouselDots');
        
        this.currentSlide = 0;
        this.totalSlides = this.slides.length;
        this.touchStartX = 0;
        this.touchEndX = 0;
        
        if (this.track && this.slides.length) {
            this.init();
        }
    }

    init() {
        this.createDots();
        this.bindEvents();
        this.update();
    }

    createDots() {
        if (!this.dotsContainer) return;
        
        for (let i = 0; i < this.totalSlides; i++) {
            const dot = document.createElement('button');
            dot.classList.add('carousel-dot');
            dot.setAttribute('aria-label', `Ir a slide ${i + 1}`);
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', () => this.goTo(i));
            this.dotsContainer.appendChild(dot);
        }
        
        this.dots = document.querySelectorAll('.carousel-dot');
    }

    bindEvents() {
        // Button controls
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => this.prev());
        }
        
        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => this.next());
        }

        // Touch events
        this.track.addEventListener('touchstart', (e) => {
            this.touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.track.addEventListener('touchend', (e) => {
            this.touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isInViewport()) {
                if (e.key === 'ArrowLeft') this.prev();
                if (e.key === 'ArrowRight') this.next();
            }
        });
    }

    isInViewport() {
        const rect = this.track.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
        );
    }

    handleSwipe() {
        const diff = this.touchStartX - this.touchEndX;
        const threshold = 50;
        
        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                this.next();
            } else {
                this.prev();
            }
        }
    }

    goTo(index) {
        if (index >= 0 && index < this.totalSlides) {
            this.currentSlide = index;
            this.update();
        }
    }

    prev() {
        if (this.currentSlide > 0) {
            this.currentSlide--;
            this.update();
        }
    }

    next() {
        if (this.currentSlide < this.totalSlides - 1) {
            this.currentSlide++;
            this.update();
        }
    }

    update() {
        // Update track position
        this.track.style.transform = `translateX(-${this.currentSlide * 100}%)`;
        
        // Update dots
        if (this.dots) {
            this.dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === this.currentSlide);
            });
        }

        // Update buttons
        if (this.prevBtn) {
            this.prevBtn.disabled = this.currentSlide === 0;
        }
        
        if (this.nextBtn) {
            this.nextBtn.disabled = this.currentSlide === this.totalSlides - 1;
        }
    }
}

export function initCarousel(options) {
    return new Carousel(options);
}

export default Carousel;
