document.addEventListener("DOMContentLoaded", function () {
    const carouselContainer = document.querySelector(".carousel-container");
    const carouselItems = document.querySelectorAll(".carousel-item");
    const prevButton = document.querySelector(".prev");
    const nextButton = document.querySelector(".next");

    let currentIndex = 0;
    let startX = 0; // Posición inicial del toque o clic
    let isDragging = false; // Indica si el usuario está arrastrando

    // Función para mostrar el elemento actual
    function showCurrentItem() {
        carouselContainer.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateButtonStates();
    }

    // Función para actualizar el estado de los botones
    function updateButtonStates() {
        prevButton.disabled = currentIndex === 0; // Deshabilita "prev" si estamos en el primer elemento
        nextButton.disabled = currentIndex === carouselItems.length - 1; // Deshabilita "next" si estamos en el último elemento
    }

    // Evento para el botón "prev"
    prevButton.addEventListener("click", function () {
        if (currentIndex > 0) {
            currentIndex--; // Retrocede solo si no estamos en el primer elemento
            showCurrentItem();
        }
    });

    // Evento para el botón "next"
    nextButton.addEventListener("click", function () {
        if (currentIndex < carouselItems.length - 1) {
            currentIndex++; // Avanza solo si no estamos en el último elemento
            showCurrentItem();
        }
    });

    // Inicializar el estado de los botones al cargar la página
    updateButtonStates();

    // ------------------------------
    // FUNCIONALIDAD DE DESLIZAMIENTO
    // ------------------------------

    // Variables para controlar el deslizamiento
    let isTouchDevice = 'ontouchstart' in window;

    // Evento de inicio del deslizamiento
    function handleStart(e) {
        isDragging = true;
        startX = isTouchDevice ? e.touches[0].pageX : e.pageX;
    }

    // Evento durante el deslizamiento
    function handleMove(e) {
        if (!isDragging) return;

        const currentX = isTouchDevice ? e.touches[0].pageX : e.pageX;
        const deltaX = currentX - startX;

        // Aplicar una transformación temporal mientras se arrastra
        carouselContainer.style.transition = "none";
        carouselContainer.style.transform = `translateX(calc(-${currentIndex * 100}% + ${deltaX}px))`;
    }

    // Evento de finalización del deslizamiento
    function handleEnd(e) {
        if (!isDragging) return;

        isDragging = false;
        carouselContainer.style.transition = "transform 0.5s ease";

        const endX = isTouchDevice ? e.changedTouches[0].pageX : e.pageX;
        const deltaX = endX - startX;

        // Determinar si el desplazamiento fue lo suficientemente grande
        if (deltaX > 50 && currentIndex > 0) {
            currentIndex--; // Deslizar a la izquierda
        } else if (deltaX < -50 && currentIndex < carouselItems.length - 1) {
            currentIndex++; // Deslizar a la derecha
        }

        showCurrentItem();
    }

    // Agregar eventos para dispositivos táctiles
    if (isTouchDevice) {
        carouselContainer.addEventListener("touchstart", handleStart);
        carouselContainer.addEventListener("touchmove", handleMove);
        carouselContainer.addEventListener("touchend", handleEnd);
    }

    // Agregar eventos para dispositivos con mouse
    carouselContainer.addEventListener("mousedown", handleStart);
    carouselContainer.addEventListener("mousemove", handleMove);
    carouselContainer.addEventListener("mouseup", handleEnd);
    carouselContainer.addEventListener("mouseleave", handleEnd); // Detener si el mouse sale del contenedor
});