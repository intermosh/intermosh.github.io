/**
 * Navigation Module
 * Handles mobile menu, smooth scroll, and header effects
 * © Intermosh 2025
 */

export function initNavigation() {
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const header = document.querySelector('header');
    const body = document.body;

    // Toggle body scroll when menu opens/closes
    if (navToggle) {
        navToggle.addEventListener('change', () => {
            if (navToggle.checked) {
                body.style.overflow = 'hidden';
            } else {
                body.style.overflow = '';
            }
        });
    }

    // Close mobile menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navToggle) {
                navToggle.checked = false;
                body.style.overflow = '';
            }
        });
    });

    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navToggle && navToggle.checked) {
            navToggle.checked = false;
            body.style.overflow = '';
        }
    });

    // Header scroll effect
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        lastScroll = currentScroll;
    }, { passive: true });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            
            // Skip if it's just "#" or external link
            if (targetId === '#' || !targetId.startsWith('#')) return;
            
            e.preventDefault();
            const target = document.querySelector(targetId);
            
            if (target) {
                target.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
        });
    });
}

export default initNavigation;
