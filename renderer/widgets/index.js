// Widgets for the workbench (build mode, by the lighthouse in the Studio).
// A widget is a small add-on with its own card on the workbench mat. To add one, make a file in this folder,
// load it below with a <script src="widgets/your-widget.js"> line in renderer/index.html (after this file), and have it call:
//
//   AllieWidgets.register({
//     id: "water",                 // unique, lowercase
//     title: "Water today",        // shown on the card
//     uses: [],                    // which parts of the app to refresh after save(), e.g. ["todos"] (see DEPS in index.html)
//     mount(el, api) {             // el: the card's body to draw into. api.data is Jack's data object (saved to data.json),
//       el.textContent = "Hi";     // api.save() saves it, api.say(text) makes Allie say something.
//     }
//   });
//
// Keep widget data under its own key, e.g. api.data.widgets = api.data.widgets || {}; api.data.widgets.water = {...}.
window.AllieWidgets = window.AllieWidgets || {
  list: [],
  register(w) { if (w && w.id && !this.list.some(x => x.id === w.id)) this.list.push(w); }
};
