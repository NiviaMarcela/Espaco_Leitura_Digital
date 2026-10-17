const btnTodosLivros = document.getElementById("btnTodosLivros");

btnTodosLivros.addEventListener("click", () => {
    document.querySelectorAll(".livro").forEach(livro => {
        livro.style.display = "";
    });
});