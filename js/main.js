// MENU
// Constante para el botón de menú
const menuToggle = document.getElementById('menu-toggle');

// Función para ocultar el menú móvil suavemente
function hideMobileMenu() {
    const menu = document.querySelector('.menu');
    if (menuToggle.checked) {
        setTimeout(() => {
            menu.style.opacity = '1'; // Restaura la opacidad del menú a 1 después de un breve retraso
            menuToggle.checked = false; // Desmarca el interruptor del menú móvil
        }, 300); // Tiempo de espera para que se complete la transición (300 milisegundos)
    }
}

menuToggle.addEventListener('change', () => {
    if (!menuToggle.checked) {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
});

// Smooth scrolling y ocultar el menú móvil después de hacer clic en un enlace
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
        hideMobileMenu(); // Oculta el menú móvil después de hacer clic en un enlace
    });
});

// ANIMATIONS
// FADEIN 
const faders = document.querySelectorAll('.fade-in-section');
const appearOptions = {
    threshold: 0.6,
};

const appearOnScroll = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('appear');
        observer.unobserve(entry.target);
    });
}, appearOptions);

faders.forEach(fader => {
    appearOnScroll.observe(fader);
});