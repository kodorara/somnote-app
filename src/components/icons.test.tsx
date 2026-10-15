import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  SaveIcon,
  FolderIcon,
  SearchIcon,
  LinkIcon,
  PreviewIcon,
  EditIcon,
  TrashIcon,
  RefreshIcon,
  CloseIcon,
} from './icons'

describe('icons', () => {
  it('renders all icons with default props', () => {
    const { container: c1 } = render(<SaveIcon />)
    expect(c1.querySelector('svg')).toBeInTheDocument()

    const { container: c2 } = render(<FolderIcon />)
    expect(c2.querySelector('svg')).toBeInTheDocument()

    const { container: c3 } = render(<SearchIcon />)
    expect(c3.querySelector('svg')).toBeInTheDocument()

    const { container: c4 } = render(<LinkIcon />)
    expect(c4.querySelector('svg')).toBeInTheDocument()

    const { container: c5 } = render(<PreviewIcon />)
    expect(c5.querySelector('svg')).toBeInTheDocument()

    const { container: c6 } = render(<EditIcon />)
    expect(c6.querySelector('svg')).toBeInTheDocument()

    const { container: c7 } = render(<TrashIcon />)
    expect(c7.querySelector('svg')).toBeInTheDocument()

    const { container: c8 } = render(<RefreshIcon />)
    expect(c8.querySelector('svg')).toBeInTheDocument()

    const { container: c9 } = render(<CloseIcon />)
    expect(c9.querySelector('svg')).toBeInTheDocument()
  })

  it('respects custom size and className', () => {
    const { container } = render(<SaveIcon size={24} className="custom-icon" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
    expect(svg).toHaveClass('custom-icon')
  })
})
