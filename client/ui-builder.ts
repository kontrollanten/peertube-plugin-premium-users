export class UiBuilder {
  rootEl: HTMLElement

  constructor (rootEl: HTMLElement) {
    this.rootEl = rootEl
  }

  renderRow (firstCol: HTMLElement[], secondCol?: HTMLElement[]): HTMLElement {
    return this.div(
      [
        this.div(
          firstCol,
          secondCol ? 'col-12 col-lg-4 col-xl-3' : 'col-12'
        ),
        ...(secondCol
          ? [this.div(
              secondCol,
              'col-12 col-lg-8 col-xl-9'
            )]
          : [])
      ],
      'row'
    )
  }

  div (children: HTMLElement[], className?: string): HTMLElement {
    const elem = document.createElement('div')

    if (className) {
      elem.className = className
    }

    children.forEach(c => elem.appendChild(c))

    return elem
  }

  a (innerText: string, attrs?: { [key: string]: string }): HTMLElement {
    const elem = document.createElement('a')
    elem.innerText = innerText

    for (const attr in attrs) {
      elem.setAttribute(attr, attrs[attr])
    }

    return elem
  }

  h2 (innerText: string): HTMLElement {
    const elem = document.createElement('h2')
    elem.innerText = innerText

    return elem
  }

  p (innerText: string, className?: string): HTMLElement {
    const elem = document.createElement('p')
    elem.innerText = innerText

    if (className) {
      elem.className = className
    }

    return elem
  }
}
