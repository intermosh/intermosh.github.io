// document.addEventListener('DOMContentLoaded', function () {
    const enterBtn = document.getElementById('enter-btn');
    const optionsContainer = document.getElementById('options-container');
    const mainContainer = document.getElementById('main-container');


    enterBtn.addEventListener('click', function () {
        // Oculta todo el texto de la pantalla
        // mainContainer.style.opacity = 0;
        mainContainer.style.display = 'none';

        // Hace que aparezca el contenedor de opciones con una animación de fade-in
        optionsContainer.classList.add('show');
    });
// });
