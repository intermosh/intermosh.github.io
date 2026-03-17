/**
 * Main Application Entry Point
 * CINEMATRONIC Portfolio
 * © Intermosh 2025
 */

import { initNavigation } from './modules/navigation.js';
import { initAnimations, initParallax, initTiltEffect } from './modules/animations.js';
import { initCarousel } from './modules/carousel.js';

/**
 * Initialize all modules when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('%c CINEMATRONIC ', 'background: #00ff88; color: #000; font-weight: bold; padding: 4px 8px;');
    console.log('%c © Intermosh 2025 ', 'color: #888; font-size: 10px;');

    // Core modules
    initNavigation();
    initAnimations();
    
    // Carousel
    initCarousel({
        trackSelector: '.commercial-track',
        slideSelector: '.commercial-slide',
        prevBtnId: 'prevBtn',
        nextBtnId: 'nextBtn',
        dotsContainerId: 'carouselDots'
    });

    // Optional effects
    initParallax();
    initTiltEffect();

    // Log initialization
    console.log('All modules initialized ✓');
});

/**
 * Handle page visibility changes
 * Pause/resume animations when tab is not visible
 */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        document.body.classList.add('paused');
    } else {
        document.body.classList.remove('paused');
    }
});

/**
 * Performance: Lazy load images
 */
if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[loading="lazy"]');
    images.forEach(img => {
        img.src = img.dataset.src || img.src;
    });
} else {
    // Fallback for browsers that don't support native lazy loading
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
    document.body.appendChild(script);
}
