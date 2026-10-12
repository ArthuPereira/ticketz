import styles from './Skeleton.module.css'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden="true" className={`${styles.skeleton} ${className ?? ''}`} />
}
