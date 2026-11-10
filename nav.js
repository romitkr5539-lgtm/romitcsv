/* nav.js — shared: dropdown menus only.
   Mobile menu toggle is handled per-page by each tool's own JS.
   Theme toggle is also handled per-page by each tool's own JS.        */
(function(){

  function init(){

    var dropdowns = document.querySelectorAll('.nav-dropdown');
    if(!dropdowns.length) return;

    dropdowns.forEach(function(dd){
      var btn = dd.querySelector('.nav-drop-btn');
      if(!btn) return;

      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var isOpen = dd.classList.contains('open');
        // close all first
        dropdowns.forEach(function(d){
          d.classList.remove('open');
          var b = d.querySelector('.nav-drop-btn');
          if(b) b.setAttribute('aria-expanded', 'false');
        });
        if(!isOpen){
          dd.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Close all dropdowns on outside click
    document.addEventListener('click', function(){
      dropdowns.forEach(function(d){
        d.classList.remove('open');
        var b = d.querySelector('.nav-drop-btn');
        if(b) b.setAttribute('aria-expanded', 'false');
      });
    });

    // Close all dropdowns on Escape
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        dropdowns.forEach(function(d){
          d.classList.remove('open');
          var b = d.querySelector('.nav-drop-btn');
          if(b) b.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
