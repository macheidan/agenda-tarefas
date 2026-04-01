import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const today = new Date().toISOString().split('T')[0];

  const events = tasks.map((task) => {
    const isOverdue =
      task.status !== 'done' && task.finishDate && task.finishDate < today;

    let backgroundColor = 'transparent';
    let textColor = undefined;
    let classNames = [];

    if (isOverdue) {
      backgroundColor = 'rgba(235, 87, 87, 0.12)';
      textColor = '#eb5757';
      classNames = ['fc-event--overdue'];
    } else if (task.status === 'done') {
      backgroundColor = 'rgba(76, 175, 80, 0.12)';
      textColor = '#2e7d32';
      classNames = ['fc-event--done'];
    } else if (task.status === 'in_progress') {
      backgroundColor = 'rgba(35, 131, 226, 0.14)';
      textColor = '#2383e2';
      classNames = ['fc-event--in-progress'];
    }

    if (!classNames.length && task.status === 'not_started') {
      backgroundColor = '#f4f4f4';
      classNames = ['fc-event--not-started'];
    }

    const event = {
      id: task.id,
      title: task.title,
      start: task.date,
      backgroundColor,
      borderColor: 'transparent',
      textColor,
      classNames,
      extendedProps: { task },
    };

    if (task.finishDate && task.finishDate > task.date) {
      const endDate = new Date(task.finishDate + 'T12:00:00');
      endDate.setDate(endDate.getDate() + 1);
      event.end = endDate.toISOString().split('T')[0];
    }

    return event;
  });

  return (
    <div className={styles.container}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridWeek"
        locale="pt-br"
        headerToolbar={{
          left: 'title',
          center: '',
          right: 'prev,dayGridMonth,next today',
        }}
        events={events}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        dayMaxEvents={false}
        buttonText={{
          today: 'Hoje',
          month: 'Visualizar o mês',
        }}
        fixedWeekCount={false}
      />
    </div>
  );
}
