;(function () {
  var labels = Array.prototype.slice.call(document.querySelectorAll('label'))
  var label = labels.find(function (l) {
    var t = (l.textContent || '').trim().toLowerCase()
    return t === 'role curve'
  })
  var select = null
  if (label && label.htmlFor) {
    select = document.getElementById(label.htmlFor)
  }
  if (!select) {
    select =
      document.querySelector('select[aria-label="Role Curve"]') ||
      document.querySelector('select[name="roleCurve"]') ||
      document.querySelector('select[data-role="role-curve"]') ||
      document.querySelector('select')
  }
  if (!select) return
  var values = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']
  var existing = Array.prototype.slice.call(select.options).map(function (o) {
    return o.value || o.textContent
  })
  values.forEach(function (v) {
    if (existing.indexOf(v) !== -1) return
    var opt = document.createElement('option')
    opt.value = v
    opt.textContent = v
    select.appendChild(opt)
  })
})()
